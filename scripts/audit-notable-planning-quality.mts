import { createClient } from "@supabase/supabase-js"
import { getPlanningAuthorityByCode } from "../lib/planning-authorities"
import { authoritativeCorkProposal } from "../lib/cork-planning-source.mjs"
import { corkAgileApplicationConfig, corkAgileSourceApplicationId } from "../lib/cork-agile-authorities.mjs"
import { authoritativeNationalProposal, cleanNationalPlanningText } from "../lib/national-planning-source.mjs"
import { AUTHORITIES, fetchAgileDetailsByReference } from "./ingest-national-planning-applications.mjs"

const ARC_QUERY = "https://services.arcgis.com/NzlPQPKn5QF9v2US/ArcGIS/rest/services/IrishPlanningApplications/FeatureServer/0/query"
const CORK_DETAIL = "https://planningapi.agileapplications.ie/api/application"
const SPECIAL_AGILE = new Set(["DLR", "FINGAL", "WEXFORD"])
const REQUEST_TIMEOUT_MS = 15000

export const compact = (value: unknown) => String(value ?? "").replace(/\s+/g, " ").trim()
export const sameStatus = (left: unknown, right: unknown) => compact(left).toLocaleLowerCase() === compact(right).toLocaleLowerCase()
export const shouldRepairProposal = (currentValue: unknown, sourceValue: unknown) => {
  const current = compact(currentValue)
  const source = compact(sourceValue)
  return Boolean(source && source.length > current.length + 10)
}
export const hasExternalStatusPrecedence = (row: Record<string, unknown>) => {
  const source = compact(row.status_source).toLowerCase()
  return source === "eplan" || source.includes("acp") || Boolean(row.appeal_decision_source) || Boolean(row.appeal_decision_date)
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))
const chunks = <T>(values: T[], size: number) => {
  const result: T[][] = []
  for (let offset = 0; offset < values.length; offset += size) result.push(values.slice(offset, offset + size))
  return result
}
const sql = (value: unknown) => compact(value).replaceAll("'", "''")

async function fetchJson(url: string, label: string, headers: Record<string, string> = {}) {
  let last: Error | null = null
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: { "User-Agent": "OpenList notable Planning quality audit", ...headers },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      })
      if (response.ok) return await response.json()
      last = new Error(`${label}: HTTP ${response.status}`)
      if (![408, 425, 429, 500, 502, 503, 504].includes(response.status)) break
    } catch (error) {
      last = error instanceof Error ? error : new Error(String(error))
    }
    if (attempt < 3) await sleep(attempt * 750)
  }
  throw last || new Error(`${label} failed`)
}

type PlanningRow = Record<string, unknown> & {
  id: string
  local_authority_code: string
  reference: string
  proposal: string | null
  status: string | null
  status_source: string | null
  source_application_id: number | null
  appeal_decision_source?: string | null
  appeal_decision_date?: string | null
}
type Source = { proposal?: string | null; status?: string | null; source: string }
type Result = {
  id: string
  authority: string
  reference: string
  source: string
  proposal: "matched" | "repaired" | "source-shorter-or-equal" | "unavailable"
  status: "matched" | "repaired" | "override-preserved" | "unavailable"
  beforeProposalLength: number
  sourceProposalLength: number
  storedStatus: string | null
  sourceStatus: string | null
  error?: string
}

async function loadNotableRows(supabase: ReturnType<typeof createClient>) {
  const ids: string[] = []
  const pageSize = 1000
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await supabase.from("planning_seo_notable")
      .select("application_id").eq("active", true).eq("priority_eligible", true)
      .order("application_id", { ascending: true }).range(offset, offset + pageSize - 1)
    if (error) throw error
    ids.push(...(data || []).map(row => row.application_id))
    if (!data || data.length < pageSize) break
  }
  const rows: PlanningRow[] = []
  for (const batch of chunks(ids, 200)) {
    const { data, error } = await supabase.from("planning_applications").select("*").in("id", batch)
    if (error) throw error
    rows.push(...((data || []) as PlanningRow[]))
  }
  return rows.sort((a, b) => a.id.localeCompare(b.id))
}

async function loadNationalSources(rows: PlanningRow[]) {
  const sources = new Map<string, Source>()
  const byAuthority = new Map<string, PlanningRow[]>()
  for (const row of rows.filter(row => !corkAgileApplicationConfig(row))) {
    const existing = byAuthority.get(row.local_authority_code) || []
    existing.push(row)
    byAuthority.set(row.local_authority_code, existing)
  }
  for (const [code, authorityRows] of byAuthority) {
    const authority = getPlanningAuthorityByCode(code)
    if (!authority) continue
    for (const batch of chunks(authorityRows, 50)) {
      const refs = batch.map(row => `'${sql(row.reference)}'`).join(",")
      const params = new URLSearchParams({
        where: `PlanningAuthority = '${sql(authority.name)}' AND ApplicationNumber IN (${refs})`,
        outFields: "ApplicationNumber,DevelopmentDescription,ApplicationStatus",
        returnGeometry: "false", f: "json", resultRecordCount: "100",
      })
      const json = await fetchJson(`${ARC_QUERY}?${params}`, `${code} ArcGIS batch`)
      const exact = new Map<string, Record<string, unknown>>()
      for (const feature of json.features || []) {
        const attrs = feature.attributes || {}
        exact.set(compact(attrs.ApplicationNumber), attrs)
      }
      for (const row of batch) {
        const attrs = exact.get(compact(row.reference))
        if (!attrs) continue
        sources.set(row.id, {
          proposal: cleanNationalPlanningText(attrs.DevelopmentDescription),
          status: cleanNationalPlanningText(attrs.ApplicationStatus),
          source: "national_arcgis",
        })
      }
    }
    if (!SPECIAL_AGILE.has(code)) continue
    const ingestAuthority = AUTHORITIES.find(item => item.code === code)
    if (!ingestAuthority) continue
    for (const row of authorityRows) {
      if (compact(row.proposal).length >= 180) continue
      const details = await fetchAgileDetailsByReference(ingestAuthority, [row], { failureMode: "best-effort" })
      const current = sources.get(row.id) || { source: "national_arcgis" }
      const full = details.get(row.reference)?.fullProposal
      if (!full) continue
      sources.set(row.id, {
        ...current,
        proposal: authoritativeNationalProposal(row.proposal, full) || current.proposal,
        source: "agile_detail+national_arcgis",
      })
    }
  }
  return sources
}

async function loadCorkSource(row: PlanningRow): Promise<Source | null> {
  const config = corkAgileApplicationConfig(row)
  if (!config) return null
  const sourceId = corkAgileSourceApplicationId(config, row)
  if (!sourceId) return null
  const detail = await fetchJson(`${CORK_DETAIL}/${sourceId}`, `${row.local_authority_code} ${row.reference} Agile detail`, {
    "x-client": config.code, "x-product": "CITIZENPORTAL", "x-service": "PA",
  })
  return { proposal: authoritativeCorkProposal(row.proposal, detail.fullProposal), status: null, source: "cork_agile_detail" }
}

async function markChecked(supabase: ReturnType<typeof createClient>, id: string) {
  const now = new Date().toISOString()
  const { error } = await supabase.from("planning_seo_notable").update({ description_checked_at: now, updated_at: now }).eq("application_id", id)
  if (error) throw error
}
async function enqueue(supabase: ReturnType<typeof createClient>, id: string) {
  const { error } = await supabase.from("planning_revalidation_queue").upsert({ application_id: id, requested_at: new Date().toISOString() }, { onConflict: "application_id" })
  if (error) throw error
}

async function applyRow(supabase: ReturnType<typeof createClient>, row: PlanningRow, source: Source, apply: boolean): Promise<Result> {
  const currentProposal = compact(row.proposal)
  const sourceProposal = compact(source.proposal)
  const sourceStatus = compact(source.status) || null
  let proposal: Result["proposal"] = sourceProposal ? "source-shorter-or-equal" : "unavailable"
  let status: Result["status"] = sourceStatus ? "matched" : "unavailable"
  const changes: Record<string, unknown> = { last_source_checked_at: new Date().toISOString() }
  if (sourceProposal && sourceProposal === currentProposal) proposal = "matched"
  else if (shouldRepairProposal(currentProposal, sourceProposal)) {
    proposal = "repaired"
    changes.proposal = sourceProposal
  }
  if (sourceStatus && !sameStatus(row.status, sourceStatus)) {
    if (hasExternalStatusPrecedence(row)) status = "override-preserved"
    else {
      status = "repaired"
      changes.status = sourceStatus
      changes.status_source = "national_arcgis"
      changes.status_observed_at = new Date().toISOString()
    }
  }
  if (apply) {
    const { error } = await supabase.from("planning_applications").update(changes).eq("id", row.id)
    if (error) throw error
    await markChecked(supabase, row.id)
    if (proposal === "repaired" || status === "repaired") await enqueue(supabase, row.id)
  }
  return {
    id: row.id, authority: row.local_authority_code, reference: row.reference, source: source.source,
    proposal, status, beforeProposalLength: currentProposal.length, sourceProposalLength: sourceProposal.length,
    storedStatus: row.status, sourceStatus,
  }
}

export async function runNotablePlanningQualityAudit({ supabase, apply = false }: { supabase: ReturnType<typeof createClient>; apply?: boolean }) {
  const rows = await loadNotableRows(supabase)
  const nationalSources = await loadNationalSources(rows)
  const results: Result[] = []
  const failures: Result[] = []
  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index]
    try {
      let source = nationalSources.get(row.id) || null
      if (corkAgileApplicationConfig(row)) source = await loadCorkSource(row)
      if (!source) throw new Error("authoritative source record unavailable")
      results.push(await applyRow(supabase, row, source, apply))
    } catch (error) {
      const failure: Result = {
        id: row.id, authority: row.local_authority_code, reference: row.reference, source: "unavailable",
        proposal: "unavailable", status: "unavailable", beforeProposalLength: compact(row.proposal).length,
        sourceProposalLength: 0, storedStatus: row.status, sourceStatus: null,
        error: error instanceof Error ? error.message : String(error),
      }
      failures.push(failure)
      results.push(failure)
    }
    if ((index + 1) % 100 === 0) console.error(`Notable Planning quality: ${index + 1}/${rows.length}`)
    if (corkAgileApplicationConfig(row)) await sleep(125)
  }
  const counts = {
    checked: results.length - failures.length,
    total: rows.length,
    sourceFailures: failures.length,
    proposalsRepaired: results.filter(item => item.proposal === "repaired").length,
    proposalsMatched: results.filter(item => item.proposal === "matched").length,
    proposalsSourceShorterOrEqual: results.filter(item => item.proposal === "source-shorter-or-equal").length,
    statusesMatched: results.filter(item => item.status === "matched").length,
    statusesRepaired: results.filter(item => item.status === "repaired").length,
    statusOverridesPreserved: results.filter(item => item.status === "override-preserved").length,
    statusesUnavailable: results.filter(item => item.status === "unavailable").length,
  }
  return {
    generatedAt: new Date().toISOString(), mode: apply ? "apply" : "validate", complete: failures.length === 0,
    ...counts, failures, repairs: results.filter(item => item.proposal === "repaired" || item.status === "repaired"), results,
  }
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error("Missing Supabase credentials")
  const apply = process.argv.includes("--apply")
  if (apply && process.env.CONFIRM_NOTABLE_QUALITY_REPAIR !== "true") throw new Error("Production repair requires CONFIRM_NOTABLE_QUALITY_REPAIR=true")
  const outputIndex = process.argv.indexOf("--output")
  const output = outputIndex >= 0 ? process.argv[outputIndex + 1] : "artifacts/notable-planning-quality.json"
  const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
  const report = await runNotablePlanningQualityAudit({ supabase, apply })
  const { mkdir, writeFile } = await import("node:fs/promises")
  await mkdir(output.split("/").slice(0, -1).join("/") || ".", { recursive: true })
  await writeFile(output, `${JSON.stringify(report, null, 2)}\n`)
  console.log(JSON.stringify({ ...report, results: undefined }, null, 2))
  if (!report.complete) process.exitCode = 1
}

if (process.argv[1]?.endsWith("audit-notable-planning-quality.mts")) await main()
