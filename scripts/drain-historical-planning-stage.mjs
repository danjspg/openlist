import { createClient } from "@supabase/supabase-js"

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) throw new Error("Missing Supabase credentials")
const supabase = createClient(url, key, { auth: { persistSession: false } })
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
let batchSize = 1000
let insertedTotal = 0
let attemptedTotal = 0

for (;;) {
  const { data, error } = await supabase.rpc("openlist_import_historical_planning_batch", { p_limit: batchSize })
  if (error) {
    const retryable = ["57014", "57P01", "53300", "08000", "08001", "08003", "08006"].includes(error.code) || /timeout|fetch failed|temporar|connection/i.test(error.message || "")
    if (retryable && batchSize > 100) {
      batchSize = Math.max(100, Math.floor(batchSize / 2))
      console.warn(`Database pressure detected; reducing import batch to ${batchSize}`)
      await sleep(2000)
      continue
    }
    throw error
  }
  const row = data?.[0]
  if (!row) throw new Error("Historical import RPC returned no result")
  attemptedTotal += Number(row.attempted || 0)
  insertedTotal += Number(row.inserted || 0)
  console.log(JSON.stringify({ batchSize, ...row, attemptedTotal, insertedTotal }))
  if (Number(row.remaining || 0) === 0) break
  await sleep(350)
}

console.log(JSON.stringify({ complete: true, attemptedTotal, insertedTotal }))
