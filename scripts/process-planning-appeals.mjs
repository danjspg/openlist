import { createClient } from "@supabase/supabase-js"
import { MAINTENANCE_OUTCOMES, isStatementTimeout } from "../lib/maintenance-outcomes.mjs"

const PROCESSING_SOURCE_KEY = "acp_internal_processing"

export function boundedInteger(name, raw, { defaultValue, maximum }) {
  if (raw === undefined || raw === "") return defaultValue
  const value = Number(raw)
  if (!Number.isInteger(value) || value < 1 || value > maximum) {
    throw new Error(`${name} must be an integer between 1 and ${maximum}`)
  }
  return value
}

export async function runAppealProcessing({ supabase, batchSize, maxBatches, log = console.log }) {
  let totalProcessed = 0
  let totalFailed = 0
  let remaining = null
  let batches = 0
  let outcome = MAINTENANCE_OUTCOMES.HEALTHY
  let detail = null

  for (; batches < maxBatches; batches += 1) {
    const { data, error } = await supabase.rpc("openlist_process_acp_appeal_batch", { p_limit: batchSize })
    if (error) {
      outcome = isStatementTimeout(error.message) ? MAINTENANCE_OUTCOMES.UNAVAILABLE : MAINTENANCE_OUTCOMES.ERROR
      detail = sanitizeError(error.message)
      break
    }

    const result = data || {}
    const processed = Number(result.processed || 0)
    const failed = Number(result.failed || 0)
    remaining = Number(result.remaining || 0)
    totalProcessed += processed
    totalFailed += failed
    log(JSON.stringify({ batch: batches + 1, ...result }))

    if (failed > 0) {
      outcome = MAINTENANCE_OUTCOMES.ERROR
      detail = `Internal processing reported ${failed} failed queue row(s)`
      batches += 1
      break
    }
    if (processed === 0 && failed === 0) {
      if (remaining > 0) {
        outcome = MAINTENANCE_OUTCOMES.ERROR
        detail = "Processing queue made zero progress while work remained"
      }
      batches += 1
      break
    }
    if (remaining === 0) {
      batches += 1
      break
    }
  }

  return {
    outcome,
    batches,
    batchSize,
    maximumRows: batchSize * maxBatches,
    totalProcessed,
    totalFailed,
    remaining,
    complete: remaining === 0,
    resumable: remaining === null || remaining > 0,
    ...(detail ? { detail } : {}),
  }
}

async function persistProcessingCheckpoint(supabase, summary) {
  const now = new Date().toISOString()
  const { error } = await supabase.from("planning_appeal_source_state").upsert({
    source_key: PROCESSING_SOURCE_KEY,
    last_checked_at: now,
    ...(summary.outcome === MAINTENANCE_OUTCOMES.HEALTHY ? { last_successful_sync_at: now, last_error: null } : { last_error: summary.detail || summary.outcome }),
    metadata: { processing: summary },
    updated_at: now,
  })
  if (error) {
    console.error(`ACP processing checkpoint could not be updated: ${sanitizeError(error.message)}`)
    return false
  }
  return true
}

function sanitizeError(value) {
  return String(value ?? "unknown error").slice(0, 500)
}

async function main() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceRoleKey) throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required")

  const batchSize = boundedInteger("ACP_PROCESS_BATCH_SIZE", process.env.ACP_PROCESS_BATCH_SIZE, { defaultValue: 25, maximum: 50 })
  const maxBatches = boundedInteger("ACP_PROCESS_MAX_BATCHES", process.env.ACP_PROCESS_MAX_BATCHES, { defaultValue: 10, maximum: 20 })
  const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } })
  const summary = await runAppealProcessing({ supabase, batchSize, maxBatches })
  const checkpointPersisted = await persistProcessingCheckpoint(supabase, summary)
  console.log(JSON.stringify(summary, null, 2))

  if (summary.outcome !== MAINTENANCE_OUTCOMES.HEALTHY || !checkpointPersisted) process.exitCode = 1
}

if (process.argv[1]?.endsWith("process-planning-appeals.mjs")) await main()
