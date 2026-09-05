import { createClient } from "@supabase/supabase-js"

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!supabaseUrl || !serviceRoleKey) throw new Error("Missing Supabase credentials")

const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } })
const BATCH_SIZE = 10
const PAUSE_MS = 2500
const MAX_CONSECUTIVE_FAILURES = 20
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

function retryable(error) {
  return ["57014","57P01","53300","08000","08001","08003","08006"].includes(error?.code)
    || /timeout|fetch failed|temporar|connection|upstream request/i.test(error?.message || "")
}

let insertedTotal = 0
let attemptedTotal = 0
let consecutiveFailures = 0
let batchNumber = 0

for (;;) {
  let data
  let error

  try {
    const result = await supabase.rpc("openlist_import_historical_planning_batch", { p_limit: BATCH_SIZE })
    data = result.data
    error = result.error
  } catch (thrown) {
    error = thrown
  }

  if (error) {
    if (!retryable(error)) throw error
    consecutiveFailures += 1
    console.warn(JSON.stringify({
      phase: "retry",
      code: error.code || null,
      message: error.message || String(error),
      consecutiveFailures
    }))
    if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) throw error
    await sleep(Math.min(60000, 5000 * consecutiveFailures))
    continue
  }

  consecutiveFailures = 0
  const row = data?.[0]
  if (!row) throw new Error("Historical import RPC returned no result")

  const attempted = Number(row.attempted || 0)
  const inserted = Number(row.inserted || 0)
  const hasMore = Number(row.remaining || 0) > 0
  batchNumber += 1
  attemptedTotal += attempted
  insertedTotal += inserted

  console.log(JSON.stringify({
    phase: "drain",
    batchNumber,
    batchSize: BATCH_SIZE,
    attempted,
    inserted,
    attemptedTotal,
    insertedTotal,
    hasMore
  }))

  if (!hasMore || attempted === 0) break
  await sleep(PAUSE_MS)
}

console.log(JSON.stringify({ phase: "complete", attemptedTotal, insertedTotal }))
