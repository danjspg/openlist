import { createClient } from "@supabase/supabase-js"

import { getPlanningAuthorityByCode } from "../lib/planning-authorities"
import { authoritativeCorkProposal, parseCorkCouncilDate } from "../lib/cork-planning-source.mjs"
import { cleanNationalPlanningText, parseNationalArcgisDate } from "../lib/national-planning-source.mjs"
import { planningApplicationPath } from "../lib/property-intelligence"
import {
  classifyHighInterestQa, LIFECYCLE_DATE_FIELDS, proposalPresentationProblems,
  rankHighInterestCandidates, timelineProblems, type HighInterestCandidate, type LifecycleField,
} from "../lib/high-interest-planning-qa"

const args = new Set(process.argv.slice(2))
const dryRun = args.has("--dry-run")
const outputIndex = process.argv.indexOf("--output")
const output = outputIndex >= 0 ? process.argv[outputIndex + 1] : "artifacts/high-interest-planning-qa.json"
const limit = Math.min(20, Math.max(1, Number(process.env.PLANNING_HIGH_INTEREST_QA_LIMIT || 20)))
const windowDays = Math.min(90, Math.max(7, Number(process.env.PLANNING_HIGH_INTEREST_QA_WINDOW_DAYS || 28)))
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
  id: string; local_authority_code: string; reference: string; source_application_id: number | null
  proposal: string | null; status: string | null; normalized_status: string
}
type StoredEvent = { application_id: string; event_type: string; event_date: string; source_field: string | null }
type Repair = { field: string; current: string | null; source: string; classification: "missing enrichment" | "stale/incorrect value" | "fuller proposal" }
type Result = { authority: string; reference: string; path: string; clicks: number; impressions: number; outcome: "PASS" | "REPAIRABLE" | "REPAIRED" | "WARN" | "FAIL"; warnings?: string[]; failures?: string[]; repairedFields?: string[]; repairs?: Repair[]; action?: string | null; sourceEvidence: string }
type Source = { category: string; proposal?: string | null; status?: string | null; dates: Partial<Record<LifecycleField, string | null>> }
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))
async function fetchJson(url: string, label: string, headers: Record<string, string> = {}) {
  let error: Error | null = null
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const response = await fetch(url, { headers: { "User-Agent": "OpenList high-interest planning QA", ...headers } })
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

const { data: candidates, error: candidatesError } = await supabase.rpc("openlist_high_interest_planning_qa_candidates", { p_window_days: windowDays, p_limit: limit })
if (candidatesError) throw new Error(`QA cohort: ${candidatesError.message}`)
const cohort = rankHighInterestCandidates((candidates || []) as HighInterestCandidate[], limit)
const ids = cohort.map(row => row.application_id)
const { data: records, error: recordsError } = ids.length ? await supabase.from("planning_applications").select("*").in("id", ids) : { data: [], error: null }
if (recordsError) throw recordsError
const { data: events, error: eventsError } = ids.length ? await supabase.from("planning_application_events").select("application_id,event_type,event_date,source_field").in("application_id", ids) : { data: [], error: null }
if (eventsError) throw eventsError
const storedRecords = (records || []) as Stored[]
const storedEvents = (events || []) as StoredEvent[]
const recordById = new Map(storedRecords.map(row => [row.id, row]))
const eventsById = new Map<string, StoredEvent[]>()
for (const event of storedEvents) eventsById.set(event.application_id, [...(eventsById.get(event.application_id) || []), event])

const results: Result[] = []
for (const candidate of cohort) {
  const row = recordById.get(candidate.application_id)
  const authority = getPlanningAuthorityByCode(candidate.local_authority_code)
  const path = authority ? planningApplicationPath(authority, candidate.reference) : `/planning/${candidate.local_authority_code}/${candidate.reference}`
  const base = { authority: candidate.local_authority_code, reference: candidate.reference, path, clicks: candidate.clicks, impressions: candidate.impressions }
  if (!row) { results.push({ ...base, outcome: "FAIL", failures: ["stored application missing"], sourceEvidence: "database" }); continue }
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
    if (Object.keys(changes).length) {
      if (!dryRun) {
        const { error } = await supabase.from("planning_applications").update({ ...changes, updated_at: new Date().toISOString(), revalidation_pending: true }).eq("id", row.id)
        if (error) throw error
      }
    }
  } catch (error) {
    results.push({ ...base, outcome: "FAIL", warnings, failures: [...failures, `QA ${dryRun ? "transformation" : "database/write"} failure: ${error instanceof Error ? error.message : String(error)}`], sourceEvidence: source.category })
    continue
  }
  const classified = classifyHighInterestQa({ repaired: repairs.length > 0, warnings, failures })
  results.push({ ...base, outcome: dryRun && classified === "REPAIRED" ? "REPAIRABLE" : classified, warnings, failures, repairedFields: repairs.map((repair) => repair.field), repairs, action: repairs.length ? (dryRun ? "would repair through narrow lifecycle update and revalidation queue" : "repaired through narrow lifecycle update and revalidation queue") : null, sourceEvidence: source.category })
  await sleep(200)
}
const counts = {
  pass: results.filter((result) => result.outcome === "PASS").length,
  repaired: results.filter((result) => result.outcome === "REPAIRED" || result.outcome === "REPAIRABLE").length,
  repairable: results.filter((result) => result.outcome === "REPAIRABLE").length,
  warn: results.filter((result) => result.outcome === "WARN").length,
  fail: results.filter((result) => result.outcome === "FAIL").length,
}
const report = { generatedAt: new Date().toISOString(), dryRun, windowDays, limit, checked: results.length, ...counts, unresolvedFailures: counts.fail, results }
await import("node:fs/promises").then(({ mkdir, writeFile }) => mkdir(output.split("/").slice(0, -1).join("/") || ".", { recursive: true }).then(() => writeFile(output, `${JSON.stringify(report, null, 2)}\n`)))
console.log(JSON.stringify(report, null, 2))
