import { createClient } from "@supabase/supabase-js"
import {
  authoritativeCorkProposal,
} from "../lib/cork-planning-source.mjs"
import {
  corkAgileApplicationConfig,
  corkAgileSourceApplicationId,
} from "../lib/cork-agile-authorities.mjs"
import {
  authoritativeNationalProposal,
  cleanNationalPlanningText,
} from "../lib/national-planning-source.mjs"
import {
  AUTHORITIES,
  fetchAgileDetailsByReference,
} from "./ingest-national-planning-applications.mjs"

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!supabaseUrl || !serviceRoleKey) {
  throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY")
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
})

const dryRun = process.argv.includes("--dry-run")
const outputIndex = process.argv.indexOf("--output")
const outputPath = outputIndex >= 0 ? process.argv[outputIndex + 1] : null
const NEWS_WINDOW_DAYS = Math.min(7, Math.max(1, Number(process.env.NOTABLE_PLANNING_NEWS_DAYS || 2)))
const MAX_STORIES = Math.min(200, Math.max(10, Number(process.env.NOTABLE_PLANNING_MAX_STORIES || 80)))
const MAX_MATCHES = Math.min(25, Math.max(1, Number(process.env.NOTABLE_PLANNING_MAX_MATCHES || 10)))
const REQUEST_TIMEOUT_MS = Math.min(30000, Math.max(3000, Number(process.env.NOTABLE_PLANNING_REQUEST_TIMEOUT_MS || 12000)))

const NEWS_QUERIES = [
  '"planning permission" Ireland',
  '"planning application" Ireland',
  '"planning appeal" Ireland',
  '"An Coimisiún Pleanála" development',
]

const GENERIC_ENTITY_WORDS = new Set([
  "Council", "Councils", "Planning", "Permission", "Application", "Appeal", "Developer",
  "Developers", "Development", "Plans", "Plan", "Irish", "Ireland", "Cork", "Dublin",
  "Galway", "Limerick", "Waterford", "Wexford", "Kerry", "Donegal", "Meath", "Kildare",
  "Wicklow", "Clare", "Mayo", "Sligo", "Kilkenny", "Tipperary", "Louth", "Offaly",
  "Laois", "Cavan", "Carlow", "Longford", "Leitrim", "Monaghan", "Roscommon", "Westmeath",
])
const STOPWORDS = new Set([
  "the", "and", "for", "with", "from", "into", "over", "under", "that", "this", "their",
  "will", "would", "could", "should", "have", "has", "had", "planning", "permission",
  "application", "development", "developer", "council", "county", "city", "ireland", "irish",
  "appeal", "plans", "plan", "new", "site", "scheme", "refused", "approved", "approval",
])

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const clean = (value) => String(value || "").replace(/\s+/g, " ").trim()
const decodeEntities = (value) => clean(value)
  .replaceAll("&amp;", "&")
  .replaceAll("&quot;", '"')
  .replaceAll("&#39;", "'")
  .replaceAll("&apos;", "'")
  .replaceAll("&lt;", "<")
  .replaceAll("&gt;", ">")

function stripTags(value) {
  return decodeEntities(String(value || "").replace(/<[^>]+>/g, " "))
}

async function fetchText(url, label) {
  const response = await fetch(url, {
    redirect: "follow",
    headers: { "User-Agent": "OpenList notable Planning discovery" },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  })
  if (!response.ok) throw new Error(`${label}: HTTP ${response.status}`)
  return { text: await response.text(), finalUrl: response.url }
}

function xmlTag(block, tag) {
  const match = block.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, "i"))
  return match ? stripTags(match[1].replace(/^<!\[CDATA\[/, "").replace(/\]\]>$/, "")) : ""
}

function parseRss(xml) {
  return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/gi)].map((match) => {
    const block = match[1]
    const sourceMatch = block.match(/<source(?:\s+url="([^"]+)")?>([\s\S]*?)<\/source>/i)
    return {
      title: xmlTag(block, "title").replace(/\s+-\s+[^-]+$/, "").trim(),
      link: xmlTag(block, "link"),
      description: xmlTag(block, "description"),
      publishedAt: xmlTag(block, "pubDate"),
      publisher: sourceMatch ? stripTags(sourceMatch[2]) : "",
      publisherUrl: sourceMatch?.[1] || "",
    }
  }).filter((story) => story.title && story.link)
}

async function discoverStories() {
  const stories = new Map()
  for (const query of NEWS_QUERIES) {
    const rss = `https://news.google.com/rss/search?q=${encodeURIComponent(`${query} when:${NEWS_WINDOW_DAYS}d`)}&hl=en-IE&gl=IE&ceid=IE:en`
    try {
      const { text } = await fetchText(rss, `Google News RSS ${query}`)
      for (const story of parseRss(text)) {
        const key = `${story.title.toLowerCase()}|${story.publisher.toLowerCase()}`
        if (!stories.has(key)) stories.set(key, story)
      }
    } catch (error) {
      console.warn(error instanceof Error ? error.message : String(error))
    }
  }
  return [...stories.values()]
    .sort((a, b) => Date.parse(b.publishedAt || 0) - Date.parse(a.publishedAt || 0))
    .slice(0, MAX_STORIES)
}

async function enrichStoryText(story) {
  try {
    const { text, finalUrl } = await fetchText(story.link, story.title)
    const title = text.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)/i)?.[1]
      || text.match(/<title>([\s\S]*?)<\/title>/i)?.[1]
      || ""
    const description = text.match(/<meta[^>]+(?:name|property)=["'](?:description|og:description)["'][^>]+content=["']([^"']+)/i)?.[1]
      || text.match(/<meta[^>]+content=["']([^"']+)["'][^>]+(?:name|property)=["'](?:description|og:description)["']/i)?.[1]
      || ""
    return {
      ...story,
      resolvedUrl: finalUrl.includes("news.google.com") ? story.link : finalUrl,
      text: clean([story.title, story.description, decodeEntities(title), decodeEntities(description)].join(" ")),
    }
  } catch {
    return { ...story, resolvedUrl: story.link, text: clean(`${story.title} ${story.description}`) }
  }
}

function referenceCandidates(text) {
  const values = new Set()
  for (const match of text.matchAll(/\b(?:[A-Z]{1,4}\s*)?\d{2}[\/-][A-Z0-9/.-]{3,12}\b/gi)) {
    const value = clean(match[0]).replace(/\s+/g, "")
    if (value.length >= 5) values.add(value)
  }
  return [...values]
}

function capitalizedPhrases(text) {
  const phrases = new Set()
  const normalized = text.replace(/[|:;()]/g, " ")
  for (const match of normalized.matchAll(/\b(?:[A-Z][A-Za-z0-9&'.-]*|[A-Z]{2,})(?:\s+(?:[A-Z][A-Za-z0-9&'.-]*|[a-z]{2,4})){0,4}/g)) {
    const phrase = clean(match[0])
    const words = phrase.split(" ")
    if (phrase.length < 5 || words.length > 5) continue
    if (GENERIC_ENTITY_WORDS.has(words[0])) continue
    phrases.add(phrase)
  }
  return [...phrases]
}

function searchPhrases(story) {
  const phrases = new Set([...referenceCandidates(story.text), ...capitalizedPhrases(story.text)])
  for (const quoted of story.text.matchAll(/["“]([^"”]{5,80})["”]/g)) phrases.add(clean(quoted[1]))
  return [...phrases]
    .map((value) => value.replace(/[,%()]/g, " ").replace(/\s+/g, " ").trim())
    .filter((value) => value.length >= 5)
    .sort((a, b) => b.length - a.length)
    .slice(0, 12)
}

function tokens(value) {
  return new Set(clean(value).toLowerCase().match(/[a-z0-9]{3,}/g)?.filter((token) => !STOPWORDS.has(token)) || [])
}

function overlapRatio(candidateText, storyTokens) {
  const candidateTokens = [...tokens(candidateText)]
  if (candidateTokens.length === 0) return 0
  return candidateTokens.filter((token) => storyTokens.has(token)).length / Math.min(candidateTokens.length, 8)
}

function scoreMatch(story, row, refs) {
  const normalizedRef = clean(row.reference).replace(/\s+/g, "").toLowerCase()
  if (refs.some((ref) => ref.toLowerCase() === normalizedRef)) {
    return { score: 1, reason: "exact planning reference" }
  }
  const storyText = story.text.toLowerCase()
  const storyTokens = tokens(story.text)
  const applicant = clean(row.applicant_name)
  const applicantExact = applicant.length >= 5 && storyText.includes(applicant.toLowerCase())
  const locationOverlap = overlapRatio(row.location, storyTokens)
  const proposalOverlap = overlapRatio(row.proposal, storyTokens)
  let score = locationOverlap * 0.55 + proposalOverlap * 0.25 + (applicantExact ? 0.35 : 0)
  if (clean(row.location).length >= 8 && storyText.includes(clean(row.location).toLowerCase())) score += 0.2
  score = Math.min(0.99, score)
  return {
    score,
    reason: applicantExact
      ? `applicant + text overlap (${score.toFixed(2)})`
      : `location/proposal overlap (${score.toFixed(2)})`,
  }
}

async function candidateRowsForStory(story) {
  const refs = referenceCandidates(story.text)
  const rows = new Map()
  for (const ref of refs.slice(0, 4)) {
    const { data, error } = await supabase
      .from("planning_applications")
      .select("id,local_authority,local_authority_code,reference,proposal,location,applicant_name,source_application_id,source_url,registration_date")
      .ilike("reference", ref)
      .limit(10)
    if (error) throw error
    for (const row of data || []) rows.set(row.id, row)
  }

  const cutoff = new Date(Date.now() - 730 * 86400000).toISOString().slice(0, 10)
  for (const phrase of searchPhrases(story).filter((value) => !refs.includes(value)).slice(0, 8)) {
    const term = phrase.replace(/[,%]/g, " ")
    const { data, error } = await supabase
      .from("planning_applications")
      .select("id,local_authority,local_authority_code,reference,proposal,location,applicant_name,source_application_id,source_url,registration_date")
      .gte("registration_date", cutoff)
      .or(`location.ilike.%${term}%,proposal.ilike.%${term}%,applicant_name.ilike.%${term}%`)
      .order("registration_date", { ascending: false })
      .limit(15)
    if (error) continue
    for (const row of data || []) rows.set(row.id, row)
    if (rows.size >= 40) break
  }
  return { rows: [...rows.values()], refs }
}

function displayNameCandidate(story) {
  const title = clean(story.title).replace(/\s+-\s+[^-]+$/, "")
  const first = capitalizedPhrases(title)[0] || ""
  if (!first || first.split(" ").length > 4 || GENERIC_ENTITY_WORDS.has(first.split(" ")[0])) return null
  return first
}

function aliasesForStory(story, displayName) {
  const aliases = new Set()
  if (displayName) aliases.add(displayName)
  const title = clean(story.title).replace(/\s+-\s+[^-]+$/, "")
  if (title.length <= 140) aliases.add(title)
  for (const phrase of capitalizedPhrases(story.text).slice(0, 12)) aliases.add(phrase)
  return [...aliases].filter((value) => value.length >= 3).slice(0, 20)
}

async function upsertNotable(row, story, match) {
  const { data: existing, error: existingError } = await supabase
    .from("planning_seo_notable")
    .select("display_name,search_aliases,evidence,source,reason")
    .eq("application_id", row.id)
    .maybeSingle()
  if (existingError) throw existingError

  const inferredName = displayNameCandidate(story)
  const displayName = existing?.display_name || inferredName
  const searchAliases = [...new Set([
    ...(Array.isArray(existing?.search_aliases) ? existing.search_aliases : []),
    ...aliasesForStory(story, displayName),
    clean(row.applicant_name),
  ].filter(Boolean))].slice(0, 30)
  const priorStories = Array.isArray(existing?.evidence?.stories) ? existing.evidence.stories : []
  const storyEvidence = {
    publisher: story.publisher || null,
    headline: story.title,
    published_at: story.publishedAt || null,
    url: story.resolvedUrl || story.link,
    match_score: Number(match.score.toFixed(3)),
    matched_by: match.reason,
  }
  const stories = [storyEvidence, ...priorStories.filter((item) => item?.url !== storyEvidence.url)].slice(0, 10)
  const payload = {
    application_id: row.id,
    source: "press",
    reason: "Notable Planning application identified from recent Irish press coverage.",
    evidence: { stories, last_discovered_at: new Date().toISOString() },
    active: true,
    display_name: displayName,
    search_aliases: searchAliases,
    updated_at: new Date().toISOString(),
  }
  if (!dryRun) {
    const { error } = await supabase.from("planning_seo_notable").upsert(payload, { onConflict: "application_id" })
    if (error) throw error
  }
  return { displayName, searchAliases, wasExisting: Boolean(existing) }
}

async function officialProposal(row) {
  const corkConfig = corkAgileApplicationConfig(row)
  if (corkConfig) {
    const sourceApplicationId = corkAgileSourceApplicationId(corkConfig, row)
    if (!sourceApplicationId) return null
    const response = await fetch(`https://planningapi.agileapplications.ie/api/application/${sourceApplicationId}`, {
      headers: {
        "User-Agent": "OpenList notable Planning description audit",
        "x-client": corkConfig.code,
        "x-product": "CITIZENPORTAL",
        "x-service": "PA",
      },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })
    if (!response.ok) throw new Error(`${row.reference} Cork detail HTTP ${response.status}`)
    const detail = await response.json()
    return authoritativeCorkProposal(row.proposal, detail.fullProposal)
  }

  if (["DLR", "FINGAL", "WEXFORD"].includes(row.local_authority_code)) {
    const authority = AUTHORITIES.find((item) => item.code === row.local_authority_code)
    if (!authority) return null
    const details = await fetchAgileDetailsByReference(authority, [row], { failureMode: "warn" })
    const detail = details.get(row.reference)
    return authoritativeNationalProposal(row.proposal, detail?.fullProposal)
  }

  const authority = AUTHORITIES.find((item) => item.code === row.local_authority_code)
  if (!authority) return null
  const params = new URLSearchParams({
    where: `PlanningAuthority = '${authority.name.replaceAll("'", "''")}' AND ApplicationNumber = '${clean(row.reference).replaceAll("'", "''")}'`,
    outFields: "DevelopmentDescription",
    returnGeometry: "false",
    f: "json",
    resultRecordCount: "2",
  })
  const { text } = await fetchText(`https://services.arcgis.com/NzlPQPKn5QF9v2US/ArcGIS/rest/services/IrishPlanningApplications/FeatureServer/0/query?${params}`, `${row.reference} ArcGIS detail`)
  const data = JSON.parse(text)
  if ((data.features || []).length !== 1) return null
  return cleanNationalPlanningText(data.features[0]?.attributes?.DevelopmentDescription)
}

async function auditNotableDescriptions() {
  const { data: notable, error } = await supabase
    .from("planning_seo_notable")
    .select("application_id")
    .eq("active", true)
  if (error) throw error
  const ids = (notable || []).map((row) => row.application_id)
  if (ids.length === 0) return { checked: 0, repaired: [], incomplete: [] }

  const records = []
  for (let offset = 0; offset < ids.length; offset += 100) {
    const { data, error: rowsError } = await supabase
      .from("planning_applications")
      .select("id,local_authority,local_authority_code,reference,proposal,location,applicant_name,source_application_id,source_url")
      .in("id", ids.slice(offset, offset + 100))
    if (rowsError) throw rowsError
    records.push(...(data || []))
  }

  const repaired = []
  const incomplete = []
  for (const row of records) {
    try {
      const proposal = await officialProposal(row)
      const current = clean(row.proposal)
      const authoritative = clean(proposal)
      if (authoritative && authoritative.length > current.length + 10) {
        if (!dryRun) {
          const { error: updateError } = await supabase
            .from("planning_applications")
            .update({ proposal: authoritative, updated_at: new Date().toISOString() })
            .eq("id", row.id)
          if (updateError) throw updateError
          const { error: queueError } = await supabase
            .from("planning_revalidation_queue")
            .upsert({ application_id: row.id, requested_at: new Date().toISOString() }, { onConflict: "application_id" })
          if (queueError) throw queueError
        }
        repaired.push({ authority: row.local_authority_code, reference: row.reference, before: current.length, after: authoritative.length })
      } else if (current.length < 120) {
        incomplete.push({ authority: row.local_authority_code, reference: row.reference, length: current.length })
      }
    } catch (cause) {
      incomplete.push({ authority: row.local_authority_code, reference: row.reference, error: cause instanceof Error ? cause.message : String(cause) })
    }
    await sleep(150)
  }
  return { checked: records.length, repaired, incomplete }
}

async function enqueue(ids) {
  if (dryRun || ids.length === 0) return
  const rows = [...new Set(ids)].map((application_id) => ({ application_id, requested_at: new Date().toISOString() }))
  const { error } = await supabase.from("planning_revalidation_queue").upsert(rows, { onConflict: "application_id" })
  if (error) throw error
}

async function main() {
  const discovered = await discoverStories()
  const enriched = []
  const ambiguous = []
  const changedIds = []

  for (const rawStory of discovered) {
    const story = await enrichStoryText(rawStory)
    const { rows, refs } = await candidateRowsForStory(story)
    const ranked = rows
      .map((row) => ({ row, ...scoreMatch(story, row, refs) }))
      .sort((a, b) => b.score - a.score)
    const best = ranked[0]
    const second = ranked[1]
    const highConfidence = best && best.score >= 0.78 && (!second || best.score - second.score >= 0.12 || best.score === 1)

    if (highConfidence && enriched.length < MAX_MATCHES) {
      const enrichment = await upsertNotable(best.row, story, best)
      enriched.push({
        authority: best.row.local_authority_code,
        reference: best.row.reference,
        score: Number(best.score.toFixed(3)),
        displayName: enrichment.displayName,
        aliases: enrichment.searchAliases,
        headline: story.title,
        publisher: story.publisher,
        url: story.resolvedUrl,
        existing: enrichment.wasExisting,
      })
      changedIds.push(best.row.id)
    } else if (best && best.score >= 0.55) {
      ambiguous.push({
        headline: story.title,
        publisher: story.publisher,
        candidate: `${best.row.local_authority_code} ${best.row.reference}`,
        score: Number(best.score.toFixed(3)),
        runnerUp: second ? Number(second.score.toFixed(3)) : null,
      })
    }
    await sleep(100)
  }

  await enqueue(changedIds)
  const descriptions = await auditNotableDescriptions()
  const report = {
    generatedAt: new Date().toISOString(),
    dryRun,
    newsWindowDays: NEWS_WINDOW_DAYS,
    storiesChecked: discovered.length,
    enriched,
    ambiguous,
    descriptions,
  }

  const rendered = JSON.stringify(report, null, 2)
  console.log(rendered)
  if (outputPath) {
    const { mkdir, writeFile } = await import("node:fs/promises")
    const { dirname } = await import("node:path")
    await mkdir(dirname(outputPath), { recursive: true })
    await writeFile(outputPath, `${rendered}\n`, "utf8")
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
}

export {
  aliasesForStory,
  capitalizedPhrases,
  displayNameCandidate,
  parseRss,
  referenceCandidates,
  scoreMatch,
  searchPhrases,
}
