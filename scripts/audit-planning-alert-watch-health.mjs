import fs from "node:fs"
import { createClient } from "@supabase/supabase-js"

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY")
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
})

const now = Date.now()
const staleCutoffMs = 12 * 60 * 60 * 1000
const preDecisionStatuses = new Set([
  "pre_validation",
  "registered",
  "under_assessment",
  "further_information_requested",
  "further_information_received",
])

const { data: subscriptions, error: subscriptionError } = await supabase
  .from("planning_alert_subscriptions")
  .select(`
    application_id,
    planning_applications(
      reference,local_authority_code,status,normalized_status,decision_text,decision_date,
      final_grant_date,decision_due_date,withdrawal_date,appeal_decision_date
    )
  `)
  .eq("enabled", true)
if (subscriptionError) throw subscriptionError

const appRows = [...new Map((subscriptions || []).map((row) => [row.application_id, row.planning_applications])).entries()]
  .map(([application_id, app]) => ({ application_id, ...(Array.isArray(app) ? app[0] : app) }))
  .filter((row) => row.reference)

const ids = appRows.map((row) => row.application_id)
const { data: watchRows, error: watchError } = ids.length
  ? await supabase
      .from("planning_alert_watch_state")
      .select("application_id,last_checked_at,last_successful_check_at,last_error,source_strategy,state")
      .in("application_id", ids)
  : { data: [], error: null }
if (watchError) throw watchError

const watchById = new Map((watchRows || []).map((row) => [row.application_id, row]))
const anomalies = []

function add(row, severity, type, detail) {
  anomalies.push({
    severity,
    anomaly_type: type,
    application_id: row.application_id,
    local_authority_code: row.local_authority_code,
    reference: row.reference,
    detail,
  })
}

for (const app of appRows) {
  const watch = watchById.get(app.application_id)
  if (!watch) {
    add(app, "high", "missing_watch_state", "Enabled alert has no watcher state")
    continue
  }

  if (watch.last_error) {
    add(app, "high", "watch_source_error", `${watch.source_strategy || "unknown source"}: ${watch.last_error}`)
  }

  const lastSuccess = watch.last_successful_check_at ? Date.parse(watch.last_successful_check_at) : NaN
  if (!Number.isFinite(lastSuccess)) {
    add(app, "high", "watch_never_succeeded", "Enabled alert has never completed a successful source check")
  } else if (now - lastSuccess > staleCutoffMs) {
    add(app, "high", "watch_stale", `Last successful source check was ${watch.last_successful_check_at}`)
  }

  if (app.normalized_status === "unknown" && app.status && !/^\s*(n\/?a|unknown)\s*$/i.test(app.status)) {
    add(app, "high", "unclassified_source_status", `Source status '${app.status}' is not classified`)
  }

  if (app.decision_date && preDecisionStatuses.has(app.normalized_status)) {
    add(app, "high", "decision_date_predecision_status", `Decision date ${app.decision_date} exists while canonical status is ${app.normalized_status}`)
  }

  const meaningfulDecision = app.decision_text && !/^\s*(n\/?a|unknown|none|null|not available|not recorded)\s*$/i.test(app.decision_text)
  if (meaningfulDecision && preDecisionStatuses.has(app.normalized_status)) {
    add(app, "high", "decision_text_predecision_status", `Decision '${app.decision_text}' exists while canonical status is ${app.normalized_status}`)
  }

  const state = watch.state || {}
  for (const field of ["status", "decision_date", "decision_text", "final_grant_date", "decision_due_date", "withdrawal_date", "appeal_decision_date"]) {
    const canonical = app[field] ?? null
    const watched = state[field] ?? null
    if (canonical !== watched) {
      add(app, "warning", "watch_state_divergence", `${field}: canonical=${JSON.stringify(canonical)} watcher=${JSON.stringify(watched)}`)
    }
  }
}

const counts = anomalies.reduce((acc, row) => {
  acc[row.anomaly_type] = (acc[row.anomaly_type] || 0) + 1
  return acc
}, {})
const high = anomalies.filter((row) => row.severity === "high")
const warnings = anomalies.filter((row) => row.severity === "warning")
const report = {
  generated_at: new Date().toISOString(),
  watched_application_count: appRows.length,
  high_count: high.length,
  warning_count: warnings.length,
  anomaly_count: anomalies.length,
  counts,
  anomalies,
}

fs.writeFileSync("planning-alert-watch-health-audit.json", `${JSON.stringify(report, null, 2)}\n`)
console.log(`Planning alert watcher health: ${appRows.length} watched, ${high.length} high, ${warnings.length} warning.`)
for (const [type, count] of Object.entries(counts)) console.log(`${type}: ${count}`)

if (high.length > 0) process.exitCode = 2
