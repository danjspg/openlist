import { createClient } from "@supabase/supabase-js"
import { authoritativeCorkProposal } from "../lib/cork-planning-source.mjs"
import { corkAgileApplicationConfig, corkAgileSourceApplicationId } from "../lib/cork-agile-authorities.mjs"
import { authoritativeNationalProposal, cleanNationalPlanningText } from "../lib/national-planning-source.mjs"
import { AUTHORITIES, fetchAgileDetailsByReference } from "./ingest-national-planning-applications.mjs"

const ARC_QUERY = "https://services.arcgis.com/NzlPQPKn5QF9v2US/ArcGIS/rest/services/IrishPlanningApplications/FeatureServer/0/query"
const AGILE_DETAIL = "https://planningapi.agileapplications.ie/api/application"
const SPECIAL_AGILE = new Set(["DLR", "FINGAL", "WEXFORD"])
const RETRYABLE = new Set([408, 425, 429, 500, 502, 503, 504])
const limitArg = process.argv.find((arg) => arg.startsWith("--limit="))
const limit = Math.max(1, Math.min(5000, Number(limitArg?.split("=")[1] || 1500)))
const dryRun = process.argv.includes("--dry-run")

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) throw new Error("Missing Supabase credentials")
const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })

const compact = (value) => String(value ?? "").replace(/\s+/g, " ").trim()
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const sql = (value) => compact(value).replaceAll("'", "''")

async function fetchJson(fetchUrl, label, headers = {}) {
  let last = null
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    try {
      const response = await fetch(fetchUrl, {
        headers: { "User-Agent": "OpenList truncated planning description repair", ...headers },
        signal: AbortSignal.timeout(15000),
      })
      if (response.ok) return await response.json()
      last = new Error(`${label}: HTTP ${response.status}`)
      if (!RETRYABLE.has(response.status)) break
    } catch (error) {
      last = error instanceof Error ? error : new Error(String(error))
    }
    if (attempt < 4) await sleep(attempt * 750)
  }
  throw last || new Error(`${label} failed`)
}

async function loadCandidates() {
  const { data, error } = await supabase.rpc("openlist_truncated_description_batch", { p_limit: limit })
  if (error) throw error
  return data || []
}

async function loadArcgisSources(rows) {
  const sources = new Map()
  const byAuthority = new Map()
  for (const row of rows.filter((item) => !corkAgileApplicationConfig(item))) {
    const group = byAuthority.get(row.local_authority_code) || []
    group.push(row)
    byAuthority.set(row.local_authority_code, group)
  }
  for (const [code, authorityRows] of byAuthority) {
    const authority = AUTHORITIES.find((item) => item.code === code)
    if (!authority) continue
    for (let offset = 0; offset < authorityRows.length; offset += 50) {
      const batch = authorityRows.slice(offset, offset + 50)
      const refs = batch.map((row) => `'${sql(row.reference)}'`).join(",")
      const ids = batch.map((row) => Number(row.source_application_id)).filter((value) => Number.isInteger(value) && value > 0)
      const clauses = [`PlanningAuthority = '${sql(authority.sourceName)}' AND ApplicationNumber IN (${refs})`]
      if (ids.length) clauses.unshift(`OBJECTID IN (${ids.join(",")})`)
      const params = new URLSearchParams({
        where: `(${clauses.join(") OR (")})`,
        outFields: "OBJECTID,ApplicationNumber,DevelopmentDescription",
        returnGeometry: "false",
        f: "json",
        resultRecordCount: "200",
      })
      const json = await fetchJson(`${ARC_QUERY}?${params}`, `${code} ArcGIS batch`)
      const byId = new Map()
      const byRef = new Map()
      for (const feature of json.features || []) {
        const attrs = feature.attributes || {}
        const objectId = Number(attrs.OBJECTID)
        if (Number.isInteger(objectId)) byId.set(objectId, attrs)
        byRef.set(compact(attrs.ApplicationNumber), attrs)
      }
      for (const row of batch) {
        const sourceId = Number(row.source_application_id)
        const attrs = (Number.isInteger(sourceId) ? byId.get(sourceId) : null) || byRef.get(compact(row.reference))
        if (!attrs) continue
        sources.set(row.id, cleanNationalPlanningText(attrs.DevelopmentDescription))
      }
    }
  }
  return sources
}

async function loadCorkProposal(row) {
  const config = corkAgileApplicationConfig(row)
  if (!config) return null
  const sourceId = corkAgileSourceApplicationId(config, row)
  if (!sourceId) return null
  const detail = await fetchJson(`${AGILE_DETAIL}/${sourceId}`, `${config.code} ${row.reference} detail`, {
    "x-client": config.code,
    "x-product": "CITIZENPORTAL",
    "x-service": "PA",
  })
  return authoritativeCorkProposal(row.proposal, detail.fullProposal)
}

async function loadSpecialAgileProposal(row) {
  const authority = AUTHORITIES.find((item) => item.code === row.local_authority_code)
  if (!authority || !SPECIAL_AGILE.has(row.local_authority_code)) return null
  const details = await fetchAgileDetailsByReference(authority, [row], { failureMode: "best-effort" })
  const full = details.get(row.reference)?.fullProposal
  return authoritativeNationalProposal(row.proposal, full)
}

async function markAttempted(row, proposal) {
  const now = new Date().toISOString()
  const changes = { last_source_checked_at: now }
  const current = compact(row.proposal)
  const source = compact(proposal)
  const repaired = Boolean(source && source.length > current.length + 10)
  if (repaired) {
    changes.proposal = source
    changes.updated_at = now
  }
  if (!dryRun) {
    const { error } = await supabase.from("planning_applications").update(changes).eq("id", row.id).eq("proposal", row.proposal)
    if (error) throw error
    if (repaired) {
      const { error: queueError } = await supabase.from("planning_revalidation_queue").upsert(
        { application_id: row.id, requested_at: now },
        { onConflict: "application_id" }
      )
      if (queueError) throw queueError
    }
  }
  return repaired
}

const candidates = await loadCandidates()
const arcgisSources = await loadArcgisSources(candidates)
let repaired = 0
let unavailable = 0
let failures = 0
const byAuthority = {}

for (let index = 0; index < candidates.length; index += 1) {
  const row = candidates[index]
  const stats = byAuthority[row.local_authority_code] ||= { scanned: 0, repaired: 0, unavailable: 0, failures: 0 }
  stats.scanned += 1
  try {
    let proposal = null
    if (corkAgileApplicationConfig(row)) {
      proposal = await loadCorkProposal(row)
      await sleep(125)
    } else {
      proposal = arcgisSources.get(row.id) || null
      if (SPECIAL_AGILE.has(row.local_authority_code) && compact(proposal).length <= compact(row.proposal).length + 10) {
        proposal = await loadSpecialAgileProposal(row) || proposal
      }
    }
    const changed = await markAttempted(row, proposal)
    if (changed) {
      repaired += 1
      stats.repaired += 1
    } else {
      unavailable += 1
      stats.unavailable += 1
    }
  } catch (error) {
    failures += 1
    stats.failures += 1
    console.error(`${row.local_authority_code} ${row.reference}: ${error instanceof Error ? error.message : String(error)}`)
    try { await markAttempted(row, null) } catch {}
  }
  if ((index + 1) % 100 === 0) console.error(`Truncated description repair: ${index + 1}/${candidates.length}; repaired ${repaired}`)
}

const { count: remaining } = await supabase.from("planning_applications").select("id", { count: "exact", head: true }).eq("proposal", "")
const report = {
  generatedAt: new Date().toISOString(),
  dryRun,
  scanned: candidates.length,
  repaired,
  unavailable,
  failures,
  byAuthority,
  note: "Repaired rows are queued for notable-planning revalidation; candidate selection prioritises 2024+ records and rotates attempted failures via last_source_checked_at.",
}
console.log(JSON.stringify(report, null, 2))
if (failures > Math.max(25, Math.floor(candidates.length * 0.1))) process.exitCode = 1
