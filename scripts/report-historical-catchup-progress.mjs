import { appendFile } from "fs/promises"
import { createClient } from "@supabase/supabase-js"

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!supabaseUrl || !serviceRoleKey) throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required")
const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } })

const catchups = [
  { key: "acpHistoricalAppeals", label: "ACP historical appeal references", unitsPerDay: 1000, unit: "cases" },
  { key: "eplanLifecycle", label: "ePlan lifecycle gaps", unitsPerDay: 80, unit: "applications" },
  { key: "historicalPlanningStatusBuckets", label: "Historical Planning status refresh", unitsPerDay: 16, unit: "authority-month buckets" },
]
const pct = (completed, total) => total > 0 ? (completed / total) * 100 : 100
const etaDays = (remaining, unitsPerDay) => remaining > 0 ? Math.ceil(remaining / unitsPerDay) : 0
const etaText = (days) => days === 0 ? "complete" : days < 14 ? `~${days} days` : `~${(days / 7).toFixed(1)} weeks`

const values = {}
const unavailable = []
for (const config of catchups) {
  const { data, error } = await supabase.rpc("openlist_historical_catchup_progress_part", { p_key: config.key })
  if (error) {
    unavailable.push({ key: config.key, error: error.message || String(error) })
    values[config.key] = null
  } else values[config.key] = data || {}
}

const rows = catchups.map((config) => {
  const value = values[config.key]
  if (!value) return { ...config, available: false, total: 0, completed: 0, remaining: 0, failed: 0, percent: null, etaDays: null, eta: "unavailable" }
  const total = Number(value.total || 0), completed = Number(value.completed || 0), remaining = Number(value.remaining || 0), failed = Number(value.failed || 0)
  const days = etaDays(remaining, config.unitsPerDay)
  return { ...config, available: true, total, completed, remaining, failed, percent: pct(completed, total), etaDays: days, eta: etaText(days) }
})

const report = { generatedAt: new Date().toISOString(), catchups: rows, unavailable }
console.log(JSON.stringify(report, null, 2))
if (process.env.GITHUB_STEP_SUMMARY) {
  const lines = ["## Historical catch-up progress", "", "| Catch-up | Completed | Progress | Remaining | Pace | ETA | Failures |", "|---|---:|---:|---:|---:|---:|---:|",
    ...rows.map((row) => row.available
      ? `| ${row.label} | ${row.completed.toLocaleString()}/${row.total.toLocaleString()} ${row.unit} | ${row.percent.toFixed(1)}% | ${row.remaining.toLocaleString()} | ${row.unitsPerDay.toLocaleString()}/day | ${row.eta} | ${row.failed.toLocaleString()} |`
      : `| ${row.label} | unavailable | unavailable | unavailable | ${row.unitsPerDay.toLocaleString()}/day | unavailable | unavailable |`),
    "", "Each catch-up is measured independently, so one slow population no longer suppresses the other two reports.", "ETAs are simple run-rate estimates from the configured daily pace. Dynamic source changes can move the denominator."]
  await appendFile(process.env.GITHUB_STEP_SUMMARY, `${lines.join("\n")}\n`)
}
if (unavailable.length) process.exitCode = 1
