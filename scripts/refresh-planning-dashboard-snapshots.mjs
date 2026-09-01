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

async function snapshotAuthorityCodes() {
  const { data, error } = await supabase
    .from("planning_dashboard_snapshots")
    .select("authority_code")
    .not("authority_code", "is", null)
    .order("authority_code", { ascending: true })

  if (error) {
    throw new Error(`Could not load Planning snapshot authority index: ${error.message}`)
  }

  const codes = Array.from(
    new Set((data ?? []).map((row) => row.authority_code).filter(Boolean))
  ).filter((code) => code !== "NATIONAL")

  // Refresh authority snapshots first. NATIONAL is deliberately last because it
  // is the broadest aggregation and must never hold every authority update in
  // one long Postgres transaction.
  return [...codes, "NATIONAL"]
}

const MAX_ATTEMPTS_PER_AUTHORITY = 2
const authorityCodes = await snapshotAuthorityCodes()
const failures = []
let refreshed = 0

for (const authorityCode of authorityCodes) {
  let completed = false
  let lastMessage = "unknown error"

  for (let attempt = 1; attempt <= MAX_ATTEMPTS_PER_AUTHORITY; attempt += 1) {
    const { data, error } = await supabase.rpc(
      "openlist_refresh_planning_dashboard_snapshots",
      { p_authority_codes: [authorityCode] }
    )

    const functionFailures = Array.isArray(data?.failed) ? data.failed : []
    if (!error && functionFailures.length === 0 && Number(data?.refreshed ?? 0) === 1) {
      completed = true
      refreshed += 1
      console.log(`Planning dashboard snapshot refreshed: ${authorityCode}`)
      break
    }

    lastMessage = error?.message ||
      (functionFailures.length ? `database-side timeout for ${functionFailures.join(", ")}` : "snapshot was not refreshed")

    const retryable = error ? isRetryableSnapshotError(error) : functionFailures.length > 0
    if (!retryable || attempt === MAX_ATTEMPTS_PER_AUTHORITY) break

    const delayMs = 5000 * attempt
    console.warn(
      `Planning dashboard snapshot ${authorityCode} attempt ${attempt}/${MAX_ATTEMPTS_PER_AUTHORITY} failed: ${lastMessage}; retrying in ${delayMs}ms.`
    )
    await sleep(delayMs)
  }

  if (!completed) {
    failures.push({ authorityCode, message: lastMessage })
    console.warn(`Planning dashboard snapshot failed: ${authorityCode}: ${lastMessage}`)
  }
}

console.log("Planning dashboard snapshot publication complete", {
  attempted: authorityCodes.length,
  refreshed,
  failed: failures.map((failure) => failure.authorityCode),
})

if (failures.length) {
  throw new Error(
    `Planning dashboard snapshot refresh failed for ${failures.map((failure) => failure.authorityCode).join(", ")}`
  )
}
