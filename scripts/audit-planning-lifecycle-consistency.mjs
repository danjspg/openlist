import fs from "node:fs"
import {
  MAINTENANCE_OUTCOMES,
  classifyDatabaseVerificationFailure,
  maintenanceExitCode,
} from "../lib/maintenance-outcomes.mjs"

export const LIFECYCLE_CHECKS = [
  "APPEAL_DECIDED_STILL_APPEALED",
  "APPEAL_DATE_ORDER_ERROR",
  "ACP_DECISION_STATE_MISMATCH",
  "ACP_OPEN_STATE_MISMATCH",
]

export function boundedAuditLimit(raw = process.env.PLANNING_LIFECYCLE_AUDIT_LIMIT) {
  if (raw === undefined || raw === "") return 500
  const value = Number(raw)
  if (!Number.isInteger(value) || value < 1 || value > 500) {
    throw new Error("PLANNING_LIFECYCLE_AUDIT_LIMIT must be an integer between 1 and 500")
  }
  return value
}

export async function auditPlanningLifecycleConsistency({
  supabaseUrl,
  serviceRoleKey,
  fetchImpl = fetch,
  limit = boundedAuditLimit(),
} = {}) {
  if (!supabaseUrl || !serviceRoleKey) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY")

  const rows = []
  const checks = []
  for (const check of LIFECYCLE_CHECKS) {
    let response
    try {
      response = await fetchImpl(`${supabaseUrl}/rest/v1/rpc/openlist_planning_lifecycle_inconsistencies_for_check`, {
        method: "POST",
        headers: { apikey: serviceRoleKey, authorization: `Bearer ${serviceRoleKey}`, "content-type": "application/json" },
        body: JSON.stringify({ p_check: check, p_limit: limit }),
      })
    } catch (error) {
      const outcome = classifyDatabaseVerificationFailure({ error })
      checks.push({ check, outcome, detail: sanitizeError(error) })
      return lifecycleReport(rows, checks, outcome)
    }

    if (!response.ok) {
      const body = await response.text()
      const outcome = classifyDatabaseVerificationFailure({ status: response.status, body })
      checks.push({ check, outcome, http_status: response.status, detail: sanitizeError(body) })
      return lifecycleReport(rows, checks, outcome)
    }

    let result
    try {
      result = await response.json()
    } catch (error) {
      checks.push({ check, outcome: MAINTENANCE_OUTCOMES.ERROR, detail: sanitizeError(error) })
      return lifecycleReport(rows, checks, MAINTENANCE_OUTCOMES.ERROR)
    }
    if (!Array.isArray(result)) {
      checks.push({ check, outcome: MAINTENANCE_OUTCOMES.ERROR, detail: "RPC returned a non-array result" })
      return lifecycleReport(rows, checks, MAINTENANCE_OUTCOMES.ERROR)
    }
    rows.push(...result)
    checks.push({ check, outcome: result.length ? MAINTENANCE_OUTCOMES.MISMATCH : MAINTENANCE_OUTCOMES.HEALTHY, count: result.length })
  }

  return lifecycleReport(rows, checks, rows.length ? MAINTENANCE_OUTCOMES.MISMATCH : MAINTENANCE_OUTCOMES.HEALTHY)
}

function lifecycleReport(rows, checks, outcome) {
  const high = rows.filter((row) => row.severity === "high")
  const warnings = rows.filter((row) => row.severity === "warning")
  const counts = rows.reduce((acc, row) => {
    acc[row.anomaly_type] = (acc[row.anomaly_type] ?? 0) + 1
    return acc
  }, {})
  return {
    generated_at: new Date().toISOString(), outcome: high.length ? MAINTENANCE_OUTCOMES.MISMATCH : outcome,
    high_count: high.length, warning_count: warnings.length, anomaly_count: rows.length,
    checks,
    checks_run: checks.filter((item) => item.outcome === MAINTENANCE_OUTCOMES.HEALTHY || item.outcome === MAINTENANCE_OUTCOMES.MISMATCH).map((item) => item.check),
    checks_unavailable: checks.filter((item) => item.outcome === MAINTENANCE_OUTCOMES.UNAVAILABLE).map((item) => item.check),
    counts, anomalies: rows,
  }
}

function sanitizeError(value) {
  return String(value instanceof Error ? value.message : value ?? "unknown error")
    .replace(/Bearer\s+\S+/gi, "Bearer [redacted]")
    .slice(0, 500)
}

async function main() {
  let report
  try {
    report = await auditPlanningLifecycleConsistency({
      supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL?.trim(),
      serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY?.trim(),
    })
  } catch (error) {
    report = lifecycleReport([], [{ check: "configuration", outcome: MAINTENANCE_OUTCOMES.ERROR, detail: sanitizeError(error) }], MAINTENANCE_OUTCOMES.ERROR)
  }

  fs.writeFileSync("planning-lifecycle-consistency-audit.json", `${JSON.stringify(report, null, 2)}\n`)
  console.log(`Planning lifecycle consistency: ${report.outcome}; ${report.high_count} high, ${report.warning_count} warning.`)
  for (const [type, count] of Object.entries(report.counts)) console.log(`${type}: ${count}`)
  process.exitCode = maintenanceExitCode(report.outcome, { actionableMismatch: report.high_count > 0 })
}

if (process.argv[1]?.endsWith("audit-planning-lifecycle-consistency.mjs")) await main()
