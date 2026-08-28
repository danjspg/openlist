import { createHash } from "node:crypto"
import { createClient } from "@supabase/supabase-js"
import {
  authoritativeNationalProposal,
  cleanNationalPlanningText,
} from "../lib/national-planning-source.mjs"
import {
  AUTHORITIES,
  fetchAgileDetailsByReference,
} from "./ingest-national-planning-applications.mjs"
import { authoritativeCorkProposal } from "../lib/cork-planning-source.mjs"
import {
  corkAgileApplicationConfig,
  corkAgileSourceApplicationId,
} from "../lib/cork-agile-authorities.mjs"
import { mergePressNotableMetadata } from "../lib/planning-notable-persistence.mjs"

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!supabaseUrl || !serviceRoleKey) throw new Error("Missing Supabase credentials")

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
})

const outputIndex = process.argv.indexOf("--output")
const outputPath = outputIndex >= 0 ? process.argv[outputIndex + 1] : null
const dryRun = process.argv.includes("--dry-run")
const NEWS_WINDOW_DAYS = Math.min(30, Math.max(1, Number(process.env.NOTABLE_PLANNING_NEWS_DAYS || 7)))
const MAX_STORIES = Math.min(500, Math.max(20, Number(process.env.NOTABLE_PLANNING_MAX_STORIES || 200)))
const MAX_MATCHES = Math.min(100, Math.max(1, Number(process.env.NOTABLE_PLANNING_MAX_MATCHES || 30)))
const MAX_DESCRIPTION_CHECKS = Math.min(100, Math.max(1, Number(process.env.NOTABLE_PLANNING_DESCRIPTION_CHECKS || 30)))
const REQUEST_TIMEOUT_MS = Math.min(30000, Math.max(3000, Number(process.env.NOTABLE_PLANNING_REQUEST_TIMEOUT_MS || 12000)))
const REPROCESS_SEEN = process.env.NOTABLE_PLANNING_REPROCESS_SEEN === "true"

const NEWS_QUERIES = [
  '"planning permission" Ireland',
  '"planning application" Ireland',
  '"planning appeal" Ireland',
  '"An Coimisiún Pleanála" development',
  'planning approved Ireland development',
  'planning refused Ireland development',
  'planning retention Ireland business',
  'planning permission homes Ireland',
  'planning permission apartments Ireland',
  'planning permission hotel Ireland',
  'planning permission retail Ireland',
  'planning permission restaurant Ireland',
  'planning permission drive-thru Ireland',
  'planning permission data centre Ireland',
  'planning permission renewable energy Ireland',
  'planning permission wind farm Ireland',
  'planning permission solar farm Ireland',
  'planning permission student accommodation Ireland',
  'planning permission housing scheme Ireland',
  'planning permission mixed-use Ireland',
]

const ROI_TERMS = [
  "ireland", "dublin", "cork", "galway", "limerick", "waterford", "wexford", "kerry", "donegal",
  "meath", "kildare", "wicklow", "clare", "mayo", "sligo", "kilkenny", "tipperary", "louth", "offaly",
  "laois", "cavan", "carlow", "longford", "leitrim", "monaghan", "roscommon", "westmeath", "fingal",
  "south dublin", "dún laoghaire", "dun laoghaire", "portlaoise", "drogheda", "macroom", "rosslare",
]
const EXPLICIT_NON_ROI = [
  "england", "scotland", "wales", "northern ireland", "belfast", "derry", "londonderry", "antrim", "armagh",
  "down", "fermanagh", "tyrone", "london", "manchester", "liverpool", "salford", "southampton", "somerset",
  "west lothian", "newport", "bolton", "blackpool", "cookstown", "maesteg",
]
const KNOWN_IRISH_PUBLISHERS = [
  "irish examiner", "irish independent", "independent.ie", "the irish times", "business post", "rte",
  "thejournal.ie", "breakingnews.ie", "ireland live", "limerick leader", "westmeath independent", "shannonside",
  "laois nationalist", "donegal daily", "cork beo", "galway beo", "echolive", "waterford news", "tipperary live",
]
const STOPWORDS = new Set([
  "the", "and", "for", "with", "from", "into", "over", "under", "that", "this", "their", "will", "would",
  "could", "should", "have", "has", "had", "planning", "permission", "application", "development", "developer",
  "council", "county", "city", "ireland", "irish", "appeal", "plans", "plan", "new", "site", "scheme",
  "refused", "approved", "approval",
])
const ADDRESS_WORDS = /\b(?:street|road|avenue|lane|quay|square|park|estate|centre|center|village|town|building|buildings|house|hotel|mall|retail|drive[- ]?thru|industrial|business|campus|harbour|harbor)\b/i
const AUTHORITY_COUNTY = {
  CORKCOCO: "cork", CORKCITY: "cork", DUBLINCITY: "dublin", FINGAL: "dublin", SOUTHDUBLIN: "dublin", DLR: "dublin",
  KILDARE: "kildare", GALWAYCOCO: "galway", GALWAYCITY: "galway", MEATH: "meath", WICKLOW: "wicklow",
  LIMERICK: "limerick", WATERFORD: "waterford", DONEGAL: "donegal", WEXFORD: "wexford", TIPPERARY: "tipperary",
  KERRY: "kerry", MAYO: "mayo", CLARE: "clare", LOUTH: "louth", LAOIS: "laois", KILKENNY: "kilkenny",
  OFFALY: "offaly", CAVAN: "cavan", ROSCOMMON: "roscommon", WESTMEATH: "westmeath", MONAGHAN: "monaghan",
  LONGFORD: "longford", LEITRIM: "leitrim", SLIGO: "sligo", CARLOW: "carlow",
}
const COUNTY_TERMS = [...new Set(Object.values(AUTHORITY_COUNTY))]

const clean = (value) => String(value || "").replace(/\s+/g, " ").trim()
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const decodeEntities = (value) => clean(value)
  .replaceAll("&amp;", "&").replaceAll("&quot;", '"').replaceAll("&#39;", "'")
  .replaceAll("&apos;", "'").replaceAll("&lt;", "<").replaceAll("&gt;", ">")
  .replace(/&#(\d+);/g, (_, value) => String.fromCharCode(Number(value)))
const stripTags = (value) => decodeEntities(String(value || "").replace(/<[^>]+>/g, " "))

function storyKey(story) {
  return createHash("sha256")
    .update(`${clean(story.title).toLowerCase()}|${clean(story.publisher).toLowerCase()}|${clean(story.publishedAt)}`)
    .digest("hex")
}

async function fetchText(url, label) {
  const response = await fetch(url, {
    redirect: "follow",
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; OpenList notable Planning discovery; +https://www.openlist.ie)",
      Accept: "text/html,application/xhtml+xml,application/rss+xml,application/xml;q=0.9,*/*;q=0.8",
    },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  })
  if (!response.ok) throw new Error(`${label}: HTTP ${response.status}`)
  return { text: await response.text(), finalUrl: response.url }
}

function xmlTag(block, tag) {
  const match = block.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, "i"))
  return match ? stripTags(match[1].replace(/^<!\[CDATA\[/, "").replace(/\]\]>$/, "")) : ""
}

function parseRss(xml, provider = "rss") {
  return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/gi)].map((match) => {
    const block = match[1]
    const sourceMatch = block.match(/<source(?:\s+url="([^"]+)")?>([\s\S]*?)<\/source>/i)
    const bingSource = xmlTag(block, "News:Source") || xmlTag(block, "source")
    const publisher = sourceMatch ? stripTags(sourceMatch[2]) : bingSource
    return {
      title: xmlTag(block, "title").replace(/\s+-\s+[^-]+$/, "").trim(),
      link: xmlTag(block, "link"),
      description: xmlTag(block, "description"),
      publishedAt: xmlTag(block, "pubDate") || xmlTag(block, "published"),
      publisher,
      publisherUrl: sourceMatch?.[1] || "",
      provider,
    }
  }).filter((story) => story.title && story.link)
}

function isRepublicOfIrelandStory(story) {
  const haystack = clean(`${story.title} ${story.description} ${story.publisher}`).toLowerCase()
  const publisher = clean(story.publisher).toLowerCase()
  const strongIrishPublisher = KNOWN_IRISH_PUBLISHERS.some((name) => publisher.includes(name))
  const roiSignal = ROI_TERMS.some((term) => haystack.includes(term))
  const nonRoiSignal = EXPLICIT_NON_ROI.some((term) => haystack.includes(term))
  if (nonRoiSignal && !roiSignal && !strongIrishPublisher) return false
  return strongIrishPublisher || roiSignal || publisher.endsWith(".ie")
}

async function discoverStories() {
  const stories = new Map()
  for (const query of NEWS_QUERIES) {
    const googleUrl = `https://news.google.com/rss/search?q=${encodeURIComponent(`${query} when:${NEWS_WINDOW_DAYS}d`)}&hl=en-IE&gl=IE&ceid=IE:en`
    const bingUrl = `https://www.bing.com/news/search?q=${encodeURIComponent(`${query} freshness:${NEWS_WINDOW_DAYS}d`)}&format=rss&mkt=en-IE`
    for (const [provider, url] of [["google", googleUrl], ["bing", bingUrl]]) {
      try {
        const { text } = await fetchText(url, `${provider} news ${query}`)
        for (const story of parseRss(text, provider)) {
          if (!isRepublicOfIrelandStory(story)) continue
          const key = `${story.title.toLowerCase()}|${story.publisher.toLowerCase()}`
          const current = stories.get(key)
          const direct = !story.link.includes("news.google.com")
          if (!current || (direct && current.link.includes("news.google.com"))) stories.set(key, story)
        }
      } catch (error) {
        console.warn(error instanceof Error ? error.message : String(error))
      }
    }
  }
  return [...stories.values()]
    .sort((a, b) => Date.parse(b.publishedAt || 0) - Date.parse(a.publishedAt || 0))
    .slice(0, MAX_STORIES)
}

async function seenStoryKeys(stories) {
  if (REPROCESS_SEEN || stories.length === 0) return new Set()
  const keys = stories.map(storyKey)
  const seen = new Set()
  for (let offset = 0; offset < keys.length; offset += 100) {
    const { data, error } = await supabase.from("planning_notable_press_seen").select("story_key").in("story_key", keys.slice(offset, offset + 100))
    if (error) throw error
    for (const row of data || []) seen.add(row.story_key)
  }
  return seen
}

function extractJsonLdArticleBodies(html) {
  const bodies = []
  for (const match of html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const parsed = JSON.parse(match[1].trim())
      const queue = Array.isArray(parsed) ? [...parsed] : [parsed]
      while (queue.length) {
        const value = queue.shift()
        if (!value || typeof value !== "object") continue
        if (typeof value.articleBody === "string") bodies.push(value.articleBody)
        if (Array.isArray(value["@graph"])) queue.push(...value["@graph"])
      }
    } catch {}
  }
  return bodies
}

function extractReadableArticleText(html) {
  const jsonLd = extractJsonLdArticleBodies(html)
  const scoped = html.match(/<article\b[^>]*>([\s\S]*?)<\/article>/i)?.[1]
    || html.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i)?.[1] || ""
  const paragraphs = [...scoped.matchAll(/<(?:p|h2|h3|li)\b[^>]*>([\s\S]*?)<\/(?:p|h2|h3|li)>/gi)]
    .map((match) => stripTags(match[1])).filter((value) => value.length >= 20)
  return clean([...jsonLd, ...paragraphs].join(" ")).slice(0, 30000)
}

async function enrichStoryText(story) {
  try {
    const { text, finalUrl } = await fetchText(story.link, story.title)
    const title = text.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)/i)?.[1]
      || text.match(/<title>([\s\S]*?)<\/title>/i)?.[1] || ""
    const description = text.match(/<meta[^>]+(?:name|property)=["'](?:description|og:description)["'][^>]+content=["']([^"']+)/i)?.[1]
      || text.match(/<meta[^>]+content=["']([^"']+)["'][^>]+(?:name|property)=["'](?:description|og:description)["']/i)?.[1] || ""
    const canonical = text.match(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)/i)?.[1]
      || text.match(/<meta[^>]+property=["']og:url["'][^>]+content=["']([^"']+)/i)?.[1] || ""
    const articleText = extractReadableArticleText(text)
    return {
      ...story,
      resolvedUrl: canonical || finalUrl,
      articleText,
      bodyExtracted: articleText.length >= 200,
      text: clean([story.title, story.description, decodeEntities(title), decodeEntities(description), articleText].join(" ")).slice(0, 35000),
    }
  } catch {
    return { ...story, resolvedUrl: story.link, articleText: "", bodyExtracted: false, text: clean(`${story.title} ${story.description}`) }
  }
}

function referenceCandidates(text) {
  const values = new Set()
  for (const match of text.matchAll(/\b(?:[A-Z]{1,5}\s*)?\d{2}[\/-][A-Z0-9/.-]{3,18}\b/gi)) {
    const value = clean(match[0]).replace(/\s+/g, "")
    if (value.length >= 5) values.add(value)
  }
  return [...values]
}

function tokens(value) {
  return new Set(clean(value).toLowerCase().match(/[a-z0-9]{3,}/g)?.filter((token) => !STOPWORDS.has(token)) || [])
}
function overlapRatio(candidateText, storyTokens) {
  const candidateTokens = [...tokens(candidateText)]
  if (!candidateTokens.length) return 0
  return candidateTokens.filter((token) => storyTokens.has(token)).length / Math.min(candidateTokens.length, 8)
}
function addressPhrases(text) {
  const values = new Set()
  const sentences = clean(text).split(/(?<=[.!?])\s+/)
  for (const sentence of sentences) {
    if (!ADDRESS_WORDS.test(sentence)) continue
    const words = sentence.replace(/[^A-Za-z0-9&'./ -]/g, " ").split(/\s+/).filter(Boolean)
    for (let size = 3; size <= 7; size += 1) for (let start = 0; start + size <= words.length; start += 1) {
      const phrase = clean(words.slice(start, start + size).join(" "))
      if (ADDRESS_WORDS.test(phrase) && phrase.length >= 10 && phrase.length <= 90) values.add(phrase)
    }
  }
  return [...values]
}
function capitalizedPhrases(text) {
  const values = new Set()
  for (const match of clean(text).matchAll(/\b(?:[A-Z][A-Za-z0-9&'.-]*|[A-Z]{2,})(?:\s+(?:[A-Z][A-Za-z0-9&'.-]*|[a-z]{2,4})){0,5}\b/g)) {
    const phrase = clean(match[0])
    if (phrase.length >= 5 && phrase.split(" ").length <= 6) values.add(phrase)
  }
  return [...values]
}
function searchPhrases(story) {
  return [...new Set([...referenceCandidates(story.text), ...addressPhrases(story.text), ...capitalizedPhrases(story.text)])]
    .filter((value) => value.length >= 5).sort((a, b) => b.length - a.length).slice(0, 24)
}

async function candidateRowsForStory(story) {
  const refs = referenceCandidates(story.text)
  const rows = new Map()
  const select = "id,local_authority,local_authority_code,reference,proposal,location,applicant_name,source_application_id,source_url,registration_date"
  for (const ref of refs.slice(0, 8)) {
    const { data } = await supabase.from("planning_applications").select(select).ilike("reference", ref).limit(20)
    for (const row of data || []) rows.set(row.id, row)
  }
  const cutoff = new Date(Date.now() - 1095 * 86400000).toISOString().slice(0, 10)
  for (const phrase of searchPhrases(story).filter((value) => !refs.includes(value)).slice(0, 18)) {
    const term = phrase.replace(/[,%()]/g, " ").replace(/\s+/g, " ").trim()
    if (term.length < 5) continue
    const { data, error } = await supabase.from("planning_applications").select(select).gte("registration_date", cutoff)
      .or(`location.ilike.%${term}%,proposal.ilike.%${term}%,applicant_name.ilike.%${term}%`).order("registration_date", { ascending: false }).limit(25)
    if (error) continue
    for (const row of data || []) rows.set(row.id, row)
    if (rows.size >= 100) break
  }
  return { rows: [...rows.values()], refs }
}

function scoreMatch(story, row, refs) {
  const normalizedRef = clean(row.reference).replace(/\s+/g, "").toLowerCase()
  if (geographicContradiction(story, row)) return { score: 0.05, reason: "explicit geographic contradiction" }
  if (refs.some((ref) => ref.toLowerCase() === normalizedRef)) return { score: 1, reason: "exact planning reference" }
  const storyTokens = tokens(story.text)
  const storyText = story.text.toLowerCase()
  const applicant = clean(row.applicant_name)
  const applicantExact = applicant.length >= 5 && storyText.includes(applicant.toLowerCase())
  const applicantOverlap = overlapRatio(applicant, storyTokens)
  const locationOverlap = overlapRatio(row.location, storyTokens)
  const proposalOverlap = overlapRatio(row.proposal, storyTokens)
  const locationExact = clean(row.location).length >= 8 && storyText.includes(clean(row.location).toLowerCase())
  const authorityMentioned = clean(row.local_authority).length >= 4 && storyText.includes(clean(row.local_authority).toLowerCase())
  let score = locationOverlap * 0.5 + proposalOverlap * 0.2 + applicantOverlap * 0.2 + (applicantExact ? 0.3 : 0)
  if (locationExact) score += 0.3
  else if (locationOverlap >= 0.7 && tokens(row.location).size >= 3) score += 0.2
  if (authorityMentioned) score += 0.06
  return { score: Math.min(0.99, score), reason: applicantExact ? "applicant + location/text overlap" : "location/proposal/applicant overlap" }
}

function geographicContradiction(story, row) {
  const summary = clean(`${story.title} ${story.description}`).toLowerCase()
  const mentioned = COUNTY_TERMS.filter((county) => new RegExp(`\\b${county}\\b`, "i").test(summary))
  if (!mentioned.length) return false
  const candidateCounty = AUTHORITY_COUNTY[row.local_authority_code]
  return Boolean(candidateCounty && !mentioned.includes(candidateCounty))
}

function usefulEnrichmentPhrase(value) {
  const phrase = clean(value)
  const folded = phrase.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
  if (phrase.length < 3 || phrase.length > 120) return false
  if (/https?:\/\/|news\.google|bing\.com|\brss\b|\bprovider\b/.test(folded)) return false
  if (/\b(?:coimisi\w*|plean\w*|planning permission|planning application|county council|city council|irish examiner|irish independent)\b/.test(folded)) return false
  if (/\b[a-z0-9_-]{20,}\b/i.test(phrase)) return false
  return true
}

function displayNameCandidate(story) {
  for (const phrase of capitalizedPhrases(story.title)) {
    const candidate = phrase.replace(/\s+(?:wins|gets|seeks|plans|applies|secures|granted|refused|approved)$/i, "")
    if (candidate.split(" ").length <= 4 && usefulEnrichmentPhrase(candidate)) return candidate
  }
  return null
}
function aliasesForStory(story, displayName) {
  return [...new Set([displayName, story.title, ...capitalizedPhrases(story.text).slice(0, 16), ...addressPhrases(story.text).slice(0, 8)]
    .filter((value) => value && usefulEnrichmentPhrase(value)))].slice(0, 40)
}

async function upsertNotable(row, story, match) {
  const { data: existing, error: existingError } = await supabase.from("planning_seo_notable")
    .select("source,reason,display_name,search_aliases,evidence,active,notable_categories,classification_reasons,classification_sources")
    .eq("application_id", row.id).maybeSingle()
  if (existingError) throw existingError
  const displayName = existing?.display_name || displayNameCandidate(story)
  const searchAliases = [...new Set([...aliasesForStory(story, displayName), clean(row.applicant_name)].filter(usefulEnrichmentPhrase))].slice(0, 50)
  const priorStories = Array.isArray(existing?.evidence?.stories) ? existing.evidence.stories : []
  const evidence = {
    publisher: story.publisher || null, headline: story.title, published_at: story.publishedAt || null,
    url: story.resolvedUrl || story.link, match_score: Number(match.score.toFixed(3)), matched_by: match.reason,
  }
  const mutation = mergePressNotableMetadata(existing, {
    applicationId: row.id,
    displayName,
    searchAliases,
    evidence: {
      ...(existing?.evidence || {}),
      stories: [evidence, ...priorStories.filter((item) => item?.url !== evidence.url)].slice(0, 15),
      last_discovered_at: new Date().toISOString(),
    },
  })
  if (!dryRun) {
    const { error } = await supabase.from("planning_seo_notable").upsert({ ...mutation, updated_at: new Date().toISOString() }, { onConflict: "application_id" })
    if (error) throw error
  }
  return { displayName: mutation.display_name, searchAliases: mutation.search_aliases, wasExisting: Boolean(existing) }
}

async function recordSeenStory(story, outcome, best = null) {
  if (dryRun) return
  const { error } = await supabase.from("planning_notable_press_seen").upsert({
    story_key: storyKey(story), title: clean(story.title), publisher: clean(story.publisher) || null,
    url: story.resolvedUrl || story.link || null, published_at: story.publishedAt ? new Date(story.publishedAt).toISOString() : null,
    outcome, application_id: best?.row?.id || null, candidate: best?.row ? `${best.row.local_authority_code} ${best.row.reference}` : null,
    score: best ? Number(best.score.toFixed(3)) : null, last_seen_at: new Date().toISOString(),
  }, { onConflict: "story_key" })
  if (error) throw error
}

async function officialProposal(row) {
  const corkConfig = corkAgileApplicationConfig(row)
  if (corkConfig) {
    const sourceApplicationId = corkAgileSourceApplicationId(corkConfig, row)
    if (!sourceApplicationId) return null
    const response = await fetch(`https://planningapi.agileapplications.ie/api/application/${sourceApplicationId}`, {
      headers: { "User-Agent": "OpenList notable Planning description audit", "x-client": corkConfig.code, "x-product": "CITIZENPORTAL", "x-service": "PA" },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })
    if (!response.ok) return null
    const detail = await response.json()
    return authoritativeCorkProposal(row.proposal, detail.fullProposal)
  }
  if (["DLR", "FINGAL", "WEXFORD"].includes(row.local_authority_code)) {
    const authority = AUTHORITIES.find((item) => item.code === row.local_authority_code)
    if (!authority) return null
    const details = await fetchAgileDetailsByReference(authority, [row], { failureMode: "warn" })
    return authoritativeNationalProposal(row.proposal, details.get(row.reference)?.fullProposal)
  }
  const authority = AUTHORITIES.find((item) => item.code === row.local_authority_code)
  if (!authority) return null
  const params = new URLSearchParams({
    where: `PlanningAuthority = '${authority.name.replaceAll("'", "''")}' AND ApplicationNumber = '${clean(row.reference).replaceAll("'", "''")}'`,
    outFields: "DevelopmentDescription", returnGeometry: "false", f: "json", resultRecordCount: "2",
  })
  const { text } = await fetchText(`https://services.arcgis.com/NzlPQPKn5QF9v2US/ArcGIS/rest/services/IrishPlanningApplications/FeatureServer/0/query?${params}`, `${row.reference} ArcGIS detail`)
  const data = JSON.parse(text)
  if ((data.features || []).length !== 1) return null
  return cleanNationalPlanningText(data.features[0]?.attributes?.DevelopmentDescription)
}

async function auditNotableDescriptions() {
  const { data: records, error } = await supabase.rpc(
    "openlist_planning_notable_description_candidates",
    { p_limit: MAX_DESCRIPTION_CHECKS }
  )
  if (error) throw error
  const candidates = records || []
  const eligibleEvidence = new Map(candidates.map((row) => [row.id, row.evidence || {}]))
  const repaired = [], incomplete = []
  for (const row of candidates) {
    try {
      const authoritative = clean(await officialProposal(row))
      const current = clean(row.proposal)
      let outcome = "complete-no-change"
      if (authoritative && authoritative.length > current.length + 10) {
        outcome = "repaired"
        if (!dryRun) {
          const { error: updateError } = await supabase.from("planning_applications").update({ proposal: authoritative, updated_at: new Date().toISOString() }).eq("id", row.id)
          if (updateError) throw updateError
          await supabase.from("planning_revalidation_queue").upsert({ application_id: row.id, requested_at: new Date().toISOString() }, { onConflict: "application_id" })
        }
        repaired.push({ authority: row.local_authority_code, reference: row.reference, before: current.length, after: authoritative.length })
      } else if (current.length < 160) {
        outcome = "still-incomplete"
        incomplete.push({ authority: row.local_authority_code, reference: row.reference, length: current.length })
      }
      if (!dryRun) {
        const priorEvidence = eligibleEvidence.get(row.id) || {}
        const { error: auditError } = await supabase.from("planning_seo_notable").update({
          evidence: { ...priorEvidence, description_audit: { checked_at: new Date().toISOString(), outcome } },
          updated_at: new Date().toISOString(),
        }).eq("application_id", row.id)
        if (auditError) throw auditError
      }
    } catch (error) {
      incomplete.push({ authority: row.local_authority_code, reference: row.reference, error: error instanceof Error ? error.message : String(error) })
    }
  }
  return { checked: candidates.length, candidates: candidates.length, repaired, incomplete }
}

async function enqueue(ids) {
  if (dryRun || !ids.length) return
  const { error } = await supabase.from("planning_revalidation_queue").upsert([...new Set(ids)].map((application_id) => ({ application_id, requested_at: new Date().toISOString() })), { onConflict: "application_id" })
  if (error) throw error
}

function autoMatch(best, second) {
  if (!best) return false
  if (best.score === 1) return true
  if (best.score >= 0.62) return true
  const gap = second ? best.score - second.score : 1
  return best.score >= 0.5 && gap >= 0.03
}

async function main() {
  const discovered = await discoverStories()
  const seen = await seenStoryKeys(discovered)
  const pendingStories = REPROCESS_SEEN ? discovered : discovered.filter((story) => !seen.has(storyKey(story)))
  const enriched = [], ambiguous = [], unmatched = [], changedIds = []
  const funnel = {
    storiesDiscovered: discovered.length, previouslySeenSkipped: discovered.length - pendingStories.length,
    storiesProcessed: pendingStories.length, articleBodiesExtracted: 0, directPublisherLinks: discovered.filter((s) => !s.link.includes("news.google.com")).length,
    storiesWithReferences: 0, storiesWithCandidates: 0, confidentMatches: 0, ambiguousMatches: 0, unmatched: 0,
  }

  for (const rawStory of pendingStories) {
    const story = await enrichStoryText(rawStory)
    if (story.bodyExtracted) funnel.articleBodiesExtracted += 1
    const { rows, refs } = await candidateRowsForStory(story)
    if (refs.length) funnel.storiesWithReferences += 1
    if (rows.length) funnel.storiesWithCandidates += 1
    const ranked = rows.map((row) => ({ row, ...scoreMatch(story, row, refs) })).sort((a, b) => b.score - a.score)
    const best = ranked[0], second = ranked[1]
    const likelyMatch = autoMatch(best, second)
    if (likelyMatch && enriched.length < MAX_MATCHES) {
      const result = await upsertNotable(best.row, story, best)
      enriched.push({ authority: best.row.local_authority_code, reference: best.row.reference, score: Number(best.score.toFixed(3)), displayName: result.displayName, aliases: result.searchAliases, headline: story.title, publisher: story.publisher, url: story.resolvedUrl, existing: result.wasExisting, bodyExtracted: story.bodyExtracted })
      changedIds.push(best.row.id); funnel.confidentMatches += 1; await recordSeenStory(story, "matched", best)
    } else if (best && best.score >= 0.35) {
      ambiguous.push({ headline: story.title, publisher: story.publisher, candidate: `${best.row.local_authority_code} ${best.row.reference}`, score: Number(best.score.toFixed(3)), runnerUp: second ? Number(second.score.toFixed(3)) : null, bodyExtracted: story.bodyExtracted })
      funnel.ambiguousMatches += 1; await recordSeenStory(story, "ambiguous", best)
    } else {
      unmatched.push({ headline: story.title, publisher: story.publisher, candidateCount: rows.length, bestScore: best ? Number(best.score.toFixed(3)) : null, bodyExtracted: story.bodyExtracted })
      funnel.unmatched += 1; await recordSeenStory(story, "unmatched", best || null)
    }
    await sleep(40)
  }

  await enqueue(changedIds)
  const descriptions = await auditNotableDescriptions()
  const report = { generatedAt: new Date().toISOString(), dryRun, newsWindowDays: NEWS_WINDOW_DAYS, newsQueries: NEWS_QUERIES.length, storiesChecked: pendingStories.length, funnel, enriched, ambiguous, unmatched: unmatched.slice(0, 60), descriptions }
  const rendered = JSON.stringify(report, null, 2)
  console.log(rendered)
  if (outputPath) {
    const { mkdir, writeFile } = await import("node:fs/promises")
    const { dirname } = await import("node:path")
    await mkdir(dirname(outputPath), { recursive: true })
    await writeFile(outputPath, `${rendered}\n`, "utf8")
  }
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch((error) => { console.error(error); process.exitCode = 1 })

export { parseRss, isRepublicOfIrelandStory, extractReadableArticleText, referenceCandidates, scoreMatch, geographicContradiction, displayNameCandidate, aliasesForStory, storyKey, autoMatch }
