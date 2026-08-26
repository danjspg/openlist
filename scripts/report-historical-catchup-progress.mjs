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

function pct(completed, total) {
  return total > 0 ? (completed / total) * 100 : 100
}

function etaDays(remaining, unitsPerDay) {
  return remaining > 0 ? Math.ceil(remaining / unitsPerDay) : 0
}

function etaText(days) {
  if (days === 0) return "complete"
  if (days < 14) return `~${days} days`
  const weeks = days / 7
  return `~${weeks.toFixed(1)} weeks`
}

const { data, error } = await supabase.rpc("openlist_historical_catchup_progress")
if (error) throw error

const rows = catchups.map((config) => {
  const value = data?.[config.key] || {}
  const total = Number(value.total || 0)
  const completed = Number(value.completed || 0)
  const remaining = Number(value.remaining || 0)
  const failed = Number(value.failed || 0)
  const days = etaDays(remaining, config.unitsPerDay)
  return {
    ...config,
    total,
    completed,
    remaining,
    failed,
    percent: pct(completed, total),
    etaDays: days,
    eta: etaText(days),
  }
})

const report = { generatedAt: data?.generatedAt || new Date().toISOString(), catchups: rows }
console.log(JSON.stringify(report, null, 2))

if (process.env.GITHUB_STEP_SUMMARY) {
  const lines = [
    "## Historical catch-up progress",
    "",
    "| Catch-up | Completed | Progress | Remaining | Pace | ETA | Failures |",
    "|---|---:|---:|---:|---:|---:|---:|",
    ...rows.map((row) => `| ${row.label} | ${row.completed.toLocaleString()}/${row.total.toLocaleString()} ${row.unit} | ${row.percent.toFixed(1)}% | ${row.remaining.toLocaleString()} | ${row.unitsPerDay.toLocaleString()}/day | ${row.eta} | ${row.failed.toLocaleString()} |`),
    "",
    "ETAs are simple run-rate estimates from the configured daily pace. Dynamic source changes can move the denominator.",
  ]
  await appendFile(process.env.GITHUB_STEP_SUMMARY, `${lines.join("\n")}\n`)
}
