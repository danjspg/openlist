import { createClient } from "@supabase/supabase-js"

import {
  PLANNING_AUTHORITIES,
  getPlanningAuthorityByCode,
} from "../lib/planning-authorities"
import { authoritativeCorkProposal, parseCorkCouncilDate } from "../lib/cork-planning-source.mjs"
import { cleanNationalPlanningText, parseNationalArcgisDate } from "../lib/national-planning-source.mjs"
import { planningApplicationPath } from "../lib/property-intelligence"
import { parsePlanningDetailUrl } from "../lib/planning-seo"
import {
  classifyHighInterestQa,
  LIFECYCLE_DATE_FIELDS,
  proposalPresentationProblems,
  timelineProblems,
  type LifecycleField,
} from "../lib/high-interest-planning-qa"
import {
  readVercelAnalyticsConfig,
  topVercelPaths,
  type VercelAnalyticsPathRow,
} from "../lib/vercel-web-analytics"

const args = new Set(process.argv.slice(2))
const dryRun = args.has("--dry-run")
const outputIndex = process.argv.indexOf("--output")
const output = outputIndex >= 0 ? process.argv[outputIndex + 1] : "artifacts/high-interest-planning-qa.json"
const windowDays = Math.min(90, Math.max(7, Number(process.env.PLANNING_HIGH_INTEREST_QA_WINDOW_DAYS || 28)))
const batchSize = Math.min(50, Math.max(1, Number(process.env.PLANNING_TRAFFIC_QA_BATCH_SIZE || 25)))
const searchExposureLimit = Math.min(100, Math.max(0, Number(process.env.PLANNING_QA_SEARCH_EXPOSURE_LIMIT || 20)))
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!supabaseUrl || !serviceRoleKey) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY")
const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } })

const CORK_DETAIL_URL = "https://planningapi.agileapplications.ie/api/application"
const NATIONAL_QUERY_URL = "https://services.arcgis.com/NzlPQPKn5QF9v2US/ArcGIS/rest/services/IrishPlanningApplications/FeatureServer/0/query"
const NATIONAL_FIELDS = ["ApplicationNumber", "DevelopmentDescription", "ApplicationStatus", "ReceivedDate", "DecisionDate", "DecisionDueDate", "GrantDate", "ExpiryDate", "WithdrawnDate", "FIRequestDate", "FIRecDate", "AppealSubmittedDate", "AppealDecisionDate"].join(",")
const NATIONAL_FIELD_MAP: Record<LifecycleField, string | null> = {
  registration_date: "ReceivedDate", valid_date: null, decision_due_date: "DecisionDueDate",
  further_information_requested_date: "FIRequestDate", further_information_received_date: "FIRecDate",
  decision_date: "DecisionDate", final_grant_date: "GrantDate", withdrawal_date: "WithdrawnDate",
  appeal_lodged_date: "AppealSubmittedDate", appeal_decision_date: "AppealDecisionDate", expiry_date: "ExpiryDate",
}
const CORK_FIELD_MAP: Record<LifecycleField, string | null> = {
  // Cork detail enrichment is intentionally limited to the field already used
  // by ingest-cork-planning-applications. Other detail properties have not
  // been established as lifecycle semantics, so are never inferred here.
  registration_date: null, valid_date: null, decision_due_date: "decisionDueDate",
  further_information_requested_date: null, further_information_received_date: null, decision_date: null,
  final_grant_date: null, withdrawal_date: null, appeal_lodged_date: null,
  appeal_decision_date: null, expiry_date: null,
}

type Stored = Record<string, unknown> & {
  id: string
  local_authority_code: string
  reference: string
  source_application_id: number | null
  proposal: string | null
  status: string | null
  normalized_status: string
}
type StoredEvent = { application_id: string; event_type: string; event_date: string; source_field: string | null }
type SearchPerformanceRow = { application_id: string; clicks: number | string; impressions: number | string }
type SearchInterest = { clicks: number; impressions: number; traffic: boolean }
type Candidate = {
  application_id: string
  local_authority_code: string
  reference: string
  clicks: number
  impressions: number
  visitors: number
  pageviews: number
  sources: string[]
}
type Repair = { field: string; current: string | null; source: string; classification: "missing enrichment" | "stale/incorrect value" | "fuller proposal" }
type Result = {
  authority: string
  reference: string
  path: string
  clicks: number
  impressions: number
  visitors: number
  pageviews: number
  trafficSources: string[]
  outcome: "PASS" | "REPAIRABLE" | "REPAIRED" | "WARN" | "FAIL"
  warnings?: string[]
  failures?: string[]
  repairedFields?: string[]
  repairs?: Repair[]
  action?: string | null
  sourceEvidence: string
}
type Source = { category: string; proposal?: string | null; status?: string | null; dates: Partial<Record<LifecycleField, string | null>> }
type VercelDiscovery = {
  rows: VercelAnalyticsPathRow[]
  expanded: boolean
  truncatedPartitions: number
  error: string | null
}

const DAY_MS = 24 * 60 * 60 * 1000
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))
const dateOnly = (date: Date) => date.toISOString().slice(0, 10)
const chunks = <T>(values: T[], size: number) => {
  const result: T[][] = []
  for (let offset = 0; offset < values.length; offset += size) result.push(values.slice(offset, offset + size))
  return result
}

async function fetchJson(url: string, label: string, headers: Record<string, string> = {}) {
  let error: Error | null = null
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const response = await fetch(url, { headers: { "User-Agent": "OpenList traffic-driven planning QA", ...headers } })
      if (response.ok) return await response.json()
      error = new Error(`${label}: HTTP ${response.status}`)
      if (![408, 425, 429, 500, 502, 503, 504].includes(response.status)) break
    } catch (cause) { error = cause instanceof Error ? cause : new Error(String(cause)) }
    await sleep(attempt * 500)
  }
  throw error || new Error(`${label} failed`)
}

function sql(value: string) { return value.replaceAll("'", "''") }

async function loadSource(row: Stored): Promise<Source> {
  if (row.local_authority_code === "CORKCOCO") {
    if (!Number.isInteger(Number(row.source_application_id))) throw new Error("Cork source application id is unavailable")
    const detail = await fetchJson(`${CORK_DETAIL_URL}/${row.source_application_id}`, `${row.reference} Cork detail`, { "x-client": "CORKCOCO", "x-product": "CITIZENPORTAL", "x-service": "PA" })
    const dates: Source["dates"] = {}
    for (const field of LIFECYCLE_DATE_FIELDS) {
      const sourceField = CORK_FIELD_MAP[field]
      if (sourceField && Object.hasOwn(detail, sourceField) && detail[sourceField] !== undefined) dates[field] = parseCorkCouncilDate(detail[sourceField])
    }
    return { category: "cork_agile_detail", proposal: authoritativeCorkProposal(row.proposal, detail.fullProposal), dates }
  }
  const authority = getPlanningAuthorityByCode(row.local_authority_code)
  if (!authority) throw new Error("Unknown authority code")
  const params = new URLSearchParams({ where: `PlanningAuthority = '${sql(authority.name)}' AND ApplicationNumber = '${sql(row.reference)}'`, outFields: NATIONAL_FIELDS, returnGeometry: "false", f: "json", resultRecordCount: "2" })
  const data = await fetchJson(`${NATIONAL_QUERY_URL}?${params}`, `${row.reference} ArcGIS`)
  const features = data.features || []
  if (features.length !== 1) throw new Error(`ArcGIS returned ${features.length} records`)
  const source = features[0].attributes || {}
  const dates: Source["dates"] = {}
  for (const field of LIFECYCLE_DATE_FIELDS) {
    const sourceField = NATIONAL_FIELD_MAP[field]
    if (sourceField && source[sourceField] !== undefined) dates[field] = parseNationalArcgisDate(source[sourceField])
  }
  return { category: "national_arcgis", proposal: cleanNationalPlanningText(source.DevelopmentDescription), status: cleanNationalPlanningText(source.ApplicationStatus), dates }
}

async function loadSearchInterest() {
  const since = dateOnly(new Date(Date.now() - (windowDays - 1) * DAY_MS))
  const rows: SearchPerformanceRow[] = []
  const pageSize = 1000
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await supabase
      .from("planning_seo_search_performance")
      .select("application_id,clicks,impressions")
      .gte("data_date", since)
      .range(offset, offset + pageSize - 1)
    if (error) throw new Error(`QA Search Console cohort: ${error.message}`)
    rows.push(...((data || []) as SearchPerformanceRow[]))
    if (!data || data.length < pageSize) break
  }

  const grouped = new Map<string, SearchInterest>()
  for (const row of rows) {
    const current = grouped.get(row.application_id) || { clicks: 0, impressions: 0, traffic: false }
    current.clicks += Number(row.clicks || 0)
    current.impressions += Number(row.impressions || 0)
    current.traffic ||= Number(row.clicks || 0) > 0
    grouped.set(row.application_id, current)
  }

  const traffic = [...grouped.entries()].filter(([, value]) => value.clicks > 0)
  const exposureOnly = [...grouped.entries()]
    .filter(([, value]) => value.clicks === 0 && value.impressions > 0)
    .sort((left, right) => right[1].impressions - left[1].impressions)
    .slice(0, searchExposureLimit)
  return new Map([...traffic, ...exposureOnly])
}

const isRemainderRow = (row: VercelAnalyticsPathRow) => !row.requestPath.startsWith("/planning/")

function mergeVercelRows(target: Map<string, VercelAnalyticsPathRow>, rows: VercelAnalyticsPathRow[]) {
  for (const row of rows) {
    if (isRemainderRow(row)) continue
    const current = target.get(row.requestPath)
    if (!current) {
      target.set(row.requestPath, row)
      continue
    }
    // Full-window authority queries are preferred. Slice fallbacks use max rather
    // than sum so returning visitors are not double-counted across time slices.
    target.set(row.requestPath, {
      requestPath: row.requestPath,
      visitors: Math.max(current.visitors, row.visitors),
      pageviews: Math.max(current.pageviews, row.pageviews),
    })
  }
}

async function discoverVercelPlanningTraffic(): Promise<VercelDiscovery> {
  const config = readVercelAnalyticsConfig()
  if (!config) return { rows: [], expanded: false, truncatedPartitions: 0, error: "token/project/team not configured" }

  const until = new Date()
  const since = new Date(until.getTime() - windowDays * DAY_MS)
  const discovered = new Map<string, VercelAnalyticsPathRow>()
  let expanded = false
  let truncatedPartitions = 0

  try {
    const rootRows = await topVercelPaths(config, since, until, 100, "startswith(requestPath, '/planning/')")
    mergeVercelRows(discovered, rootRows)
    if (!rootRows.some(isRemainderRow)) return { rows: [...discovered.values()], expanded, truncatedPartitions, error: null }

    expanded = true
    for (const authority of PLANNING_AUTHORITIES) {
      const prefix = `/planning/${authority.slug}/ref-`
      const authorityRows = await topVercelPaths(config, since, until, 100, `startswith(requestPath, '${prefix}')`)
      mergeVercelRows(discovered, authorityRows)
      if (!authorityRows.some(isRemainderRow)) continue

      // Only busy authority partitions are split further. This removes the
      // product-level top-100 ceiling without turning every run into hundreds
      // of Analytics API requests.
      for (let segmentStart = since.getTime(); segmentStart < until.getTime(); segmentStart += 7 * DAY_MS) {
        const segmentSince = new Date(segmentStart)
        const segmentUntil = new Date(Math.min(segmentStart + 7 * DAY_MS, until.getTime()))
        const weeklyRows = await topVercelPaths(config, segmentSince, segmentUntil, 100, `startswith(requestPath, '${prefix}')`)
        mergeVercelRows(discovered, weeklyRows)
        if (!weeklyRows.some(isRemainderRow)) continue

        for (let dayStart = segmentSince.getTime(); dayStart < segmentUntil.getTime(); dayStart += DAY_MS) {
          const daySince = new Date(dayStart)
          const dayUntil = new Date(Math.min(dayStart + DAY_MS, segmentUntil.getTime()))
          const dailyRows = await topVercelPaths(config, daySince, dayUntil, 100, `startswith(requestPath, '${prefix}')`)
          mergeVercelRows(discovered, dailyRows)
          if (dailyRows.some(isRemainderRow)) truncatedPartitions += 1
        }
      }
    }
    return { rows: [...discovered.values()], expanded, truncatedPartitions, error: null }
  } catch (error) {
    return {
      rows: [...discovered.values()],
      expanded,
      truncatedPartitions,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

async function loadRecordsByIds(ids: string[]) {
  const records: Stored[] = []
  for (const idChunk of chunks([...new Set(ids)], 200)) {
    if (idChunk.length === 0) continue
    const { data, error } = await supabase.from("planning_applications").select("*").in("id", idChunk)
    if (error) throw error
    records.push(...((data || []) as Stored[]))
  }
  return records
}

async function loadRecordsByReferences(byAuthority: Map<string, Set<string>>) {
  const records: Stored[] = []
  for (const [authorityCode, references] of byAuthority) {
    for (const referenceChunk of chunks([...references], 100)) {
      const { data, error } = await supabase
        .from("planning_applications")
        .select("*")
        .eq("local_authority_code", authorityCode)
        .in("reference", referenceChunk)
      if (error) throw error
      records.push(...((data || []) as Stored[]))
    }
  }
  return records
}

async function loadEvents(ids: string[]) {
  const events: StoredEvent[] = []
  for (const idChunk of chunks(ids, 200)) {
    if (idChunk.length === 0) continue
    const { data, error } = await supabase
      .from("planning_application_events")
      .select("application_id,event_type,event_date,source_field")
      .in("application_id", idChunk)
    if (error) throw error
    events.push(...((data || []) as StoredEvent[]))
  }
  return events
}

const searchInterest = await loadSearchInterest()
const searchRecords = await loadRecordsByIds([...searchInterest.keys()])
const searchRecordById = new Map(searchRecords.map(row => [row.id, row]))

const vercelDiscovery = await discoverVercelPlanningTraffic()
const vercelByAuthority = new Map<string, Set<string>>()
const vercelTrafficByKey = new Map<string, VercelAnalyticsPathRow>()
let invalidVercelPaths = 0
for (const row of vercelDiscovery.rows) {
  if (row.visitors <= 0 && row.pageviews <= 0) continue
  const parsed = parsePlanningDetailUrl(`https://www.openlist.ie${row.requestPath}`)
  if (!parsed) {
    invalidVercelPaths += 1
    continue
  }
  const key = `${parsed.localAuthorityCode}\u0000${parsed.reference}`
  vercelTrafficByKey.set(key, row)
  const references = vercelByAuthority.get(parsed.localAuthorityCode) || new Set<string>()
  references.add(parsed.reference)
  vercelByAuthority.set(parsed.localAuthorityCode, references)
}

const vercelRecords = await loadRecordsByReferences(vercelByAuthority)
const allRecords = new Map<string, Stored>()
for (const row of [...searchRecords, ...vercelRecords]) allRecords.set(row.id, row)
const recordByTrafficKey = new Map([...allRecords.values()].map(row => [`${row.local_authority_code}\u0000${row.reference}`, row]))

const candidateById = new Map<string, Candidate>()
const ensureCandidate = (row: Stored) => {
  const current = candidateById.get(row.id)
  if (current) return current
  const candidate: Candidate = {
    application_id: row.id,
    local_authority_code: row.local_authority_code,
    reference: row.reference,
    clicks: 0,
    impressions: 0,
    visitors: 0,
    pageviews: 0,
    sources: [],
  }
  candidateById.set(row.id, candidate)
  return candidate
}

for (const [applicationId, interest] of searchInterest) {
  const row = searchRecordById.get(applicationId)
  if (!row) continue
  const candidate = ensureCandidate(row)
  candidate.clicks = interest.clicks
  candidate.impressions = interest.impressions
  candidate.sources.push(interest.clicks > 0 ? "search-console-clicks" : "search-console-exposure")
}

const unresolvedVercelResults: Result[] = []
for (const [key, traffic] of vercelTrafficByKey) {
  const [authorityCode, reference] = key.split("\u0000")
  const row = recordByTrafficKey.get(key)
  if (!row) {
    unresolvedVercelResults.push({
      authority: authorityCode,
      reference,
      path: traffic.requestPath,
      clicks: 0,
      impressions: 0,
      visitors: traffic.visitors,
      pageviews: traffic.pageviews,
      trafficSources: ["vercel-web-analytics"],
      outcome: "FAIL",
      failures: ["traffic-bearing Vercel path could not be resolved to a stored planning application"],
      sourceEvidence: "database",
    })
    continue
  }
  const candidate = ensureCandidate(row)
  candidate.visitors = Math.max(candidate.visitors, traffic.visitors)
  candidate.pageviews = Math.max(candidate.pageviews, traffic.pageviews)
  if (!candidate.sources.includes("vercel-web-analytics")) candidate.sources.push("vercel-web-analytics")
}

const cohort = [...candidateById.values()].sort((left, right) => {
  const leftTraffic = left.visitors > 0 || left.clicks > 0 ? 1 : 0
  const rightTraffic = right.visitors > 0 || right.clicks > 0 ? 1 : 0
  return rightTraffic - leftTraffic ||
    right.visitors - left.visitors ||
    right.clicks - left.clicks ||
    right.pageviews - left.pageviews ||
    right.impressions - left.impressions ||
    left.local_authority_code.localeCompare(right.local_authority_code) ||
    left.reference.localeCompare(right.reference)
})

const events = await loadEvents(cohort.map(row => row.application_id))
const eventsById = new Map<string, StoredEvent[]>()
for (const event of events) eventsById.set(event.application_id, [...(eventsById.get(event.application_id) || []), event])

const results: Result[] = [...unresolvedVercelResults]
for (let offset = 0; offset < cohort.length; offset += batchSize) {
  const batch = cohort.slice(offset, offset + batchSize)
  console.error(`Planning traffic QA batch ${Math.floor(offset / batchSize) + 1}: ${batch.length} applications (${offset + 1}-${offset + batch.length} of ${cohort.length})`)
  for (const candidate of batch) {
    const row = allRecords.get(candidate.application_id)
    const authority = getPlanningAuthorityByCode(candidate.local_authority_code)
    const path = authority ? planningApplicationPath(authority, candidate.reference) : `/planning/${candidate.local_authority_code}/${candidate.reference}`
    const base = {
      authority: candidate.local_authority_code,
      reference: candidate.reference,
      path,
      clicks: candidate.clicks,
      impressions: candidate.impressions,
      visitors: candidate.visitors,
      pageviews: candidate.pageviews,
      trafficSources: candidate.sources,
    }
    if (!row) {
      results.push({ ...base, outcome: "FAIL", failures: ["stored application missing"], sourceEvidence: "database" })
      continue
    }
    const warnings = [...proposalPresentationProblems(row.proposal)]
    const lifecycle = Object.fromEntries(LIFECYCLE_DATE_FIELDS.map((field) => [field, typeof row[field] === "string" ? row[field] : null])) as Partial<Record<LifecycleField, string | null>>
    const failures = timelineProblems(lifecycle, eventsById.get(row.id) || [])
    let source: Source
    try {
      source = await loadSource(row)
    } catch (error) {
      results.push({ ...base, outcome: classifyHighInterestQa({ warnings: [...warnings, `source unavailable: ${error instanceof Error ? error.message : String(error)}`], failures }), warnings: [...warnings, `source unavailable: ${error instanceof Error ? error.message : String(error)}`], failures, sourceEvidence: "source/network failure" })
      continue
    }

    const changes: Record<string, string> = {}
    const repairs: Repair[] = []
    try {
      if (source.status !== undefined && source.status !== null && String(row.status || "").replace(/\s+/g, " ").trim() !== source.status.replace(/\s+/g, " ").trim()) {
        changes.status = source.status
        repairs.push({ field: "status", current: String(row.status || "") || null, source: source.status, classification: "stale/incorrect value" })
      }
      if (source.proposal && source.proposal !== row.proposal) {
        const current = String(row.proposal || "").trim()
        if (!current || (source.proposal.length > current.length && source.proposal.startsWith(current))) {
          changes.proposal = source.proposal
          repairs.push({ field: "proposal", current: current || null, source: source.proposal, classification: current ? "fuller proposal" : "missing enrichment" })
        }
        else warnings.push("authoritative proposal differs without an unambiguous fuller replacement")
      }
      for (const [field, value] of Object.entries(source.dates)) {
        const current = typeof row[field] === "string" ? row[field] : null
        if (current === value) continue
        if (value === null) {
          if (current) warnings.push(`${field} is absent from the current authoritative source; not cleared automatically`)
          continue
        }
        changes[field] = value
        repairs.push({ field, current, source: value, classification: current ? "stale/incorrect value" : "missing enrichment" })
      }
      if (Object.keys(changes).length && !dryRun) {
        const { error } = await supabase.from("planning_applications").update({ ...changes, updated_at: new Date().toISOString(), revalidation_pending: true }).eq("id", row.id)
        if (error) throw error
      }
    } catch (error) {
      results.push({ ...base, outcome: "FAIL", warnings, failures: [...failures, `QA ${dryRun ? "transformation" : "database/write"} failure: ${error instanceof Error ? error.message : String(error)}`], sourceEvidence: source.category })
      continue
    }
    const classified = classifyHighInterestQa({ repaired: repairs.length > 0, warnings, failures })
    results.push({ ...base, outcome: dryRun && classified === "REPAIRED" ? "REPAIRABLE" : classified, warnings, failures, repairedFields: repairs.map((repair) => repair.field), repairs, action: repairs.length ? (dryRun ? "would repair through narrow lifecycle update and revalidation queue" : "repaired through narrow lifecycle update and revalidation queue") : null, sourceEvidence: source.category })
    await sleep(200)
  }
  if (offset + batchSize < cohort.length) await sleep(500)
}

const counts = {
  pass: results.filter((result) => result.outcome === "PASS").length,
  repaired: results.filter((result) => result.outcome === "REPAIRED" || result.outcome === "REPAIRABLE").length,
  repairable: results.filter((result) => result.outcome === "REPAIRABLE").length,
  warn: results.filter((result) => result.outcome === "WARN").length,
  fail: results.filter((result) => result.outcome === "FAIL").length,
}
const trafficCandidates = cohort.filter(row => row.clicks > 0 || row.visitors > 0 || row.pageviews > 0).length
const searchExposureCandidates = cohort.length - trafficCandidates
const report = {
  generatedAt: new Date().toISOString(),
  dryRun,
  windowDays,
  batchSize,
  trafficCandidates,
  searchExposureCandidates,
  vercelPathsDiscovered: vercelTrafficByKey.size,
  vercelExpandedBeyondTop100: vercelDiscovery.expanded,
  vercelTruncatedDailyPartitions: vercelDiscovery.truncatedPartitions,
  vercelError: vercelDiscovery.error,
  invalidVercelPaths,
  checked: results.length,
  ...counts,
  unresolvedFailures: counts.fail,
  results,
}
await import("node:fs/promises").then(({ mkdir, writeFile }) => mkdir(output.split("/").slice(0, -1).join("/") || ".", { recursive: true }).then(() => writeFile(output, `${JSON.stringify(report, null, 2)}\n`)))
console.log(JSON.stringify(report, null, 2))
