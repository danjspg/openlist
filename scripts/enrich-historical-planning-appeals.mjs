import { createClient } from "@supabase/supabase-js"
import { parseAcpCasePage } from "../lib/acp-appeals-source.mjs"

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!supabaseUrl || !serviceRoleKey) {
  throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required")
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
})

const LOOKUP_LIMIT = Math.max(1, Math.min(Number(process.env.ACP_HISTORICAL_LOOKUP_LIMIT || 250), 500))
const LOOKUP_DELAY_MS = Math.max(500, Number(process.env.ACP_HISTORICAL_LOOKUP_DELAY_MS || 750))
const USER_AGENT = "OpenList historical planning appeal enrichment (+https://www.openlist.ie)"

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function fetchHtmlWithRetry(url, retries = 3) {
  let lastError
  for (let attempt = 1; attempt <= retries; attempt += 1) {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 25_000)
    try {
      const response = await fetch(url, {
        headers: { "User-Agent": USER_AGENT },
        signal: controller.signal,
      })
      if (response.status === 404) return null
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      return await response.text()
    } catch (error) {
      lastError = error
      if (attempt < retries) await sleep(attempt * 1500)
    } finally {
      clearTimeout(timeout)
    }
  }
  throw lastError
}

async function selectBacklog() {
  const { data, error } = await supabase
    .from("planning_appeal_cases")
    .select("id,acp_case_number,source_url,decision_date,source_updated_at")
    .ilike("category", "Appeals%")
    .not("decision_date", "is", null)
    .is("planning_authority_case_reference", null)
    .is("planning_reference_lookup_status", null)
    .not("source_url", "is", null)
    .order("decision_date", { ascending: false, nullsFirst: false })
    .order("source_updated_at", { ascending: false, nullsFirst: false })
    .limit(LOOKUP_LIMIT)
  if (error) throw new Error(`ACP historical backlog selection failed: ${error.message}`)
  return data || []
}

async function markLookup(row, status, { reference = null, errorMessage = null } = {}) {
  const now = new Date().toISOString()
  const update = {
    planning_reference_lookup_attempted_at: now,
    planning_reference_lookup_status: status,
    planning_reference_lookup_error: errorMessage,
    updated_at: now,
  }
  if (reference) update.planning_authority_case_reference = reference

  const { error } = await supabase
    .from("planning_appeal_cases")
    .update(update)
    .eq("id", row.id)
  if (error) throw new Error(`ACP case ${row.acp_case_number} lookup-state update failed: ${error.message}`)

  if (reference) {
    const { error: queueError } = await supabase
      .from("planning_appeal_processing_queue")
      .upsert({
        appeal_case_id: row.id,
        status: "pending",
        attempt_count: 0,
        requested_at: now,
        started_at: null,
        completed_at: null,
        next_attempt_at: now,
        last_error: null,
        updated_at: now,
      }, { onConflict: "appeal_case_id" })
    if (queueError) throw new Error(`ACP case ${row.acp_case_number} processing queue update failed: ${queueError.message}`)
  }
}

async function countRemaining() {
  const { count, error } = await supabase
    .from("planning_appeal_cases")
    .select("id", { count: "exact", head: true })
    .ilike("category", "Appeals%")
    .not("decision_date", "is", null)
    .is("planning_authority_case_reference", null)
    .is("planning_reference_lookup_status", null)
  if (error) throw error
  return count || 0
}

async function main() {
  const rows = await selectBacklog()
  let found = 0
  let notFound = 0
  let failed = 0

  for (const [index, row] of rows.entries()) {
    try {
      const html = await fetchHtmlWithRetry(row.source_url)
      if (!html) {
        await markLookup(row, "not_found")
        notFound += 1
      } else {
        const parsed = parseAcpCasePage(html)
        if (parsed.planningAuthorityCaseReference) {
          await markLookup(row, "found", { reference: parsed.planningAuthorityCaseReference })
          found += 1
        } else {
          await markLookup(row, "not_found")
          notFound += 1
        }
      }
    } catch (error) {
      failed += 1
      const message = error instanceof Error ? error.message : String(error)
      await markLookup(row, "failed", { errorMessage: message }).catch((markError) => {
        console.warn(`Could not persist failure for ACP case ${row.acp_case_number}: ${markError.message}`)
      })
      console.warn(`ACP historical case ${row.acp_case_number} failed: ${message}`)
    }

    if (LOOKUP_DELAY_MS && index < rows.length - 1) await sleep(LOOKUP_DELAY_MS)
  }

  const remaining = await countRemaining()
  console.log(JSON.stringify({ attempted: rows.length, found, notFound, failed, remaining }, null, 2))
}

await main()
