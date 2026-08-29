import { createClient } from "@supabase/supabase-js"

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!supabaseUrl || !serviceRoleKey) {
  throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required")
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
})

const BATCH_SIZE = Math.max(1, Math.min(Number(process.env.ACP_PROCESS_BATCH_SIZE || 100), 500))
const MAX_BATCHES = Math.max(1, Math.min(Number(process.env.ACP_PROCESS_MAX_BATCHES || 400), 1000))
const RETRY_LIMIT = Math.max(1, Math.min(Number(process.env.ACP_UNLINKED_RETRY_LIMIT || 500), 2000))
const SOURCE_KEY = "acp_cases_2016_onwards"

async function requeueMatchableUnlinkedCases() {
  const { data, error } = await supabase.rpc("openlist_requeue_matchable_unlinked_acp_cases", {
    p_limit: RETRY_LIMIT,
  })
  if (error) throw new Error(`ACP unlinked-case retry failed: ${error.message}`)
  const requeued = Number(data || 0)
  console.log(JSON.stringify({ requeuedMatchableUnlinkedCases: requeued }))
  return requeued
}

async function processBatch() {
  const { data, error } = await supabase.rpc("openlist_process_acp_appeal_batch", {
    p_limit: BATCH_SIZE,
  })
  if (error) throw new Error(`ACP internal processing failed: ${error.message}`)
  return data || {}
}

async function updateSourceState(processing) {
  const [{ count: links }, { data: applications }, { count: failed }] = await Promise.all([
    supabase.from("planning_appeal_links").select("appeal_case_id", { count: "exact", head: true }),
    supabase.from("planning_appeal_links").select("planning_application_id"),
    supabase.from("planning_appeal_processing_queue").select("appeal_case_id", { count: "exact", head: true }).eq("status", "failed"),
  ])
  const matchedApplications = new Set((applications || []).map((row) => row.planning_application_id)).size
  const { data: current } = await supabase
    .from("planning_appeal_source_state")
    .select("metadata")
    .eq("source_key", SOURCE_KEY)
    .maybeSingle()
  const { error } = await supabase.from("planning_appeal_source_state").upsert({
    source_key: SOURCE_KEY,
    matched_case_count: links ?? 0,
    matched_application_count: matchedApplications,
    metadata: { ...(current?.metadata || {}), processing, processingFailed: failed ?? 0 },
    updated_at: new Date().toISOString(),
  })
  if (error) throw new Error(`ACP processing state update failed: ${error.message}`)
}

async function main() {
  const requeuedMatchableUnlinkedCases = await requeueMatchableUnlinkedCases()
  let totalProcessed = 0
  let totalFailed = 0
  let remaining = null
  let batches = 0

  for (; batches < MAX_BATCHES; batches += 1) {
    const result = await processBatch()
    const processed = Number(result.processed || 0)
    const failed = Number(result.failed || 0)
    remaining = Number(result.remaining || 0)
    totalProcessed += processed
    totalFailed += failed
    console.log(JSON.stringify({ batch: batches + 1, ...result }))

    if (processed === 0 && failed === 0) break
    if (remaining === 0) break
  }

  const summary = { batches, totalProcessed, totalFailed, remaining, requeuedMatchableUnlinkedCases }
  await updateSourceState(summary)
  console.log(JSON.stringify(summary, null, 2))

  if (remaining && batches >= MAX_BATCHES) {
    throw new Error(`ACP processing stopped with ${remaining} queued cases after ${MAX_BATCHES} batches`)
  }
}

await main()
