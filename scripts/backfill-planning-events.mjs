import { createClient } from "@supabase/supabase-js"

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!supabaseUrl || !serviceRoleKey) {
  throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY")
}

const args = process.argv.slice(2)
const valueAfter = (name) => {
  const index = args.indexOf(name)
  return index >= 0 ? args[index + 1] : null
}
const batchSize = Math.max(1, Math.min(5000, Number(valueAfter("--batch-size") || 2000)))
let afterId = valueAfter("--after-id")
const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
})

let processed = 0
let inserted = 0
let normalized = 0
let batches = 0

while (true) {
  const { data, error } = await supabase.rpc("openlist_backfill_planning_events", {
    p_limit: batchSize,
    p_after_id: afterId,
  })
  if (error) throw error

  const result = data || {}
  batches += 1
  processed += Number(result.processed || 0)
  normalized += Number(result.normalized || 0)
  inserted += Number(result.inserted || 0)
  afterId = result.nextId || afterId
  console.log(
    `Planning timeline backfill batch ${batches}: ${result.processed || 0} applications, ${result.normalized || 0} statuses normalized, ${result.inserted || 0} events (${processed} applications total)`
  )
  if (result.done || !result.nextId || Number(result.processed || 0) === 0) break
}

const { data: report, error: reportError } = await supabase.rpc(
  "openlist_planning_timeline_report"
)
if (reportError) throw reportError
console.log(JSON.stringify({ processed, normalized, inserted, batches, report }, null, 2))
