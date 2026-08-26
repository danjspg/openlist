import { createClient } from "@supabase/supabase-js"
import { ACP_LAYER_URL, ACP_QUERY_URL, mapAcpFeature, parseAcpCasePage } from "../lib/acp-appeals-source.mjs"

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!supabaseUrl || !serviceRoleKey) throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required")

const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } })
const PAGE_SIZE = 2000
const UPSERT_SIZE = 250
const ENRICH_LIMIT = Math.max(0, Math.min(Number(process.env.ACP_APPEAL_ENRICH_LIMIT || 500), 2000))
const ENRICH_DELAY_MS = Math.max(0, Number(process.env.ACP_APPEAL_ENRICH_DELAY_MS || 150))
const SOURCE_KEY = "acp_cases_2016_onwards"
const USER_AGENT = "OpenList planning appeal enrichment (+https://www.openlist.ie)"

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function fetchWithRetry(url, { json = true, retries = 4 } = {}) {
  let lastError
  for (let attempt = 1; attempt <= retries; attempt += 1) {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 25_000)
    try {
      const response = await fetch(url, { headers: { "User-Agent": USER_AGENT }, signal: controller.signal })
      if (response.status === 404) return null
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      return json ? await response.json() : await response.text()
    } catch (error) {
      lastError = error
      if (attempt === retries) break
      await sleep(attempt * 1500)
    } finally {
      clearTimeout(timeout)
    }
  }
  throw lastError
}

async function layerMetadata() {
  const metadata = await fetchWithRetry(`${ACP_LAYER_URL}?f=json`)
  if (metadata?.error) throw new Error(metadata.error.message || JSON.stringify(metadata.error))
  if (metadata?.objectIdField !== "OBJECTID") throw new Error(`Unexpected ACP Object ID field: ${metadata?.objectIdField}`)
  const required = ["ABPCASEID","DEVDESC","DEVADDRESS","LODGEDON","DECISION","DECIDED_ON","LINKABPWEB","PLANINGATY","CATEGORY","UPDATED_ON"]
  const names = new Set((metadata.fields || []).map((field) => field.name))
  const missing = required.filter((name) => !names.has(name))
  if (missing.length) throw new Error(`ACP schema changed; missing fields: ${missing.join(", ")}`)
  return metadata
}

function preferredCaseRow(current, candidate) {
  if (!current) return candidate
  const currentUpdated = current.source_updated_at || ""
  const candidateUpdated = candidate.source_updated_at || ""
  if (candidateUpdated !== currentUpdated) return candidateUpdated > currentUpdated ? candidate : current
  return Number(candidate.source_object_id) > Number(current.source_object_id) ? candidate : current
}

function deduplicateCases(rows) {
  const byCaseNumber = new Map()
  for (const row of rows) {
    byCaseNumber.set(
      row.acp_case_number,
      preferredCaseRow(byCaseNumber.get(row.acp_case_number), row)
    )
  }
  return [...byCaseNumber.values()]
}

async function fetchAllFeatures() {
  const rows = []
  let sourceRecordCount = 0
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const params = new URLSearchParams({
      where: "1=1",
      outFields: "OBJECTID,ABPCASEID,DEVDESC,DEVADDRESS,LODGEDON,DECISION,DECIDED_ON,LINKABPWEB,PLANINGATY,CATEGORY,UPDATED_ON",
      returnGeometry: "false",
      orderByFields: "OBJECTID ASC",
      resultOffset: String(offset),
      resultRecordCount: String(PAGE_SIZE),
      f: "json",
    })
    const data = await fetchWithRetry(`${ACP_QUERY_URL}?${params.toString()}`)
    if (data?.error) throw new Error(data.error.message || JSON.stringify(data.error))
    const features = data?.features || []
    sourceRecordCount += features.length
    rows.push(...features.map((feature) => mapAcpFeature(feature.attributes)).filter(Boolean))
    console.log(`ACP source page offset ${offset}: ${features.length} records`)
    if (features.length < PAGE_SIZE) break
  }
  const cases = deduplicateCases(rows)
  console.log(`ACP source returned ${sourceRecordCount} rows representing ${cases.length} unique case numbers`)
  return { sourceRecordCount, cases }
}

async function upsertCases(rows) {
  for (let offset = 0; offset < rows.length; offset += UPSERT_SIZE) {
    const batch = rows.slice(offset, offset + UPSERT_SIZE)
    const { error } = await supabase.from("planning_appeal_cases").upsert(batch, { onConflict: "acp_case_number" })
    if (error) throw new Error(`ACP case upsert failed: ${error.message}`)
  }
}

async function enrichCasePages() {
  if (ENRICH_LIMIT === 0) return { attempted: 0, enriched: 0, failures: 0 }
  const { data, error } = await supabase
    .from("planning_appeal_cases")
    .select("id,acp_case_number,source_url,planning_authority_case_reference,case_type,source_updated_at,received_date")
    .or("planning_authority_case_reference.is.null,case_type.is.null")
    .not("source_url", "is", null)
    .order("source_updated_at", { ascending: false, nullsFirst: false })
    .order("received_date", { ascending: false, nullsFirst: false })
    .limit(ENRICH_LIMIT)
  if (error) throw new Error(`ACP enrichment selection failed: ${error.message}`)

  let enriched = 0
  let failures = 0
  for (const row of data || []) {
    try {
      const html = await fetchWithRetry(row.source_url, { json: false, retries: 3 })
      if (!html) continue
      const parsed = parseAcpCasePage(html)
      const updates = {}
      if (parsed.planningAuthorityCaseReference) updates.planning_authority_case_reference = parsed.planningAuthorityCaseReference
      if (parsed.caseType) updates.case_type = parsed.caseType
      if (Object.keys(updates).length) {
        updates.updated_at = new Date().toISOString()
        const { error: updateError } = await supabase.from("planning_appeal_cases").update(updates).eq("id", row.id)
        if (updateError) throw updateError
        enriched += 1
      }
    } catch (error) {
      failures += 1
      console.warn(`ACP case ${row.acp_case_number} enrichment failed: ${error.message}`)
    }
    if (ENRICH_DELAY_MS) await sleep(ENRICH_DELAY_MS)
  }
  return { attempted: (data || []).length, enriched, failures }
}

async function updateSourceState(values) {
  const { error } = await supabase.from("planning_appeal_source_state").upsert({
    source_key: SOURCE_KEY,
    ...values,
    updated_at: new Date().toISOString(),
  })
  if (error) throw new Error(`ACP source state update failed: ${error.message}`)
}

async function main() {
  const checkedAt = new Date().toISOString()
  try {
    const metadata = await layerMetadata()
    const { sourceRecordCount, cases } = await fetchAllFeatures()
    await upsertCases(cases)
    const enrichment = await enrichCasePages()
    const { data: rebuilt, error: rebuildError } = await supabase.rpc("openlist_rebuild_acp_appeal_links_and_events")
    if (rebuildError) throw new Error(`ACP link rebuild failed: ${rebuildError.message}`)
    await updateSourceState({
      last_checked_at: checkedAt,
      last_successful_sync_at: new Date().toISOString(),
      source_last_edit_at: metadata.editingInfo?.lastEditDate ? new Date(metadata.editingInfo.lastEditDate).toISOString() : null,
      source_record_count: sourceRecordCount,
      ingested_count: cases.length,
      enriched_count: enrichment.enriched,
      matched_case_count: Number(rebuilt?.links || 0),
      matched_application_count: Number(rebuilt?.matchedApplications || 0),
      last_error: null,
      metadata: {
        enrichment,
        rebuild: rebuilt,
        maxRecordCount: metadata.maxRecordCount,
        duplicateSourceRows: Math.max(0, sourceRecordCount - cases.length),
      },
    })
    console.log(JSON.stringify({ sourceRecords: sourceRecordCount, uniqueCases: cases.length, enrichment, rebuild: rebuilt }, null, 2))
  } catch (error) {
    await updateSourceState({ last_checked_at: checkedAt, last_error: error instanceof Error ? error.message : String(error) }).catch(() => {})
    throw error
  }
}

await main()
