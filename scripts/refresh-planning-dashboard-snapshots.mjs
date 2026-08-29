import { createClient } from "@supabase/supabase-js"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } }
)

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function isRetryableSnapshotError(error) {
  return (
    ["57014", "57P01", "08000", "08001", "08003", "08006", "53300"].includes(
      error?.code
    ) || /upstream request timeout|timeout|temporar|connection|fetch failed/i.test(error?.message || "")
  )
}

const MAX_ATTEMPTS = 4
let lastError

for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
  const { data, error } = await supabase.rpc("openlist_refresh_planning_dashboard_snapshots")

  if (!error) {
    console.log("Planning dashboard snapshots refreshed", data)
    process.exit(0)
  }

  lastError = error
  if (!isRetryableSnapshotError(error) || attempt === MAX_ATTEMPTS) break

  const delayMs = Math.min(30000, attempt * attempt * 5000)
  console.warn(
    `Planning dashboard snapshot refresh attempt ${attempt}/${MAX_ATTEMPTS} failed: ${error.message}; retrying in ${delayMs}ms.`
  )
  await sleep(delayMs)
}

throw new Error(`Planning dashboard snapshot refresh failed: ${lastError?.message || "unknown error"}`)
