import fs from "node:fs"

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
if (!supabaseUrl || !serviceRoleKey) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY")

const checks = ["APPEAL_DECIDED_STILL_APPEALED", "APPEAL_DATE_ORDER_ERROR", "ACP_DECISION_STATE_MISMATCH", "ACP_OPEN_STATE_MISMATCH"]
const rows = []

for (const check of checks) {
  const response = await fetch(`${supabaseUrl}/rest/v1/rpc/openlist_planning_lifecycle_inconsistencies_for_check`, {
    method: "POST",
    headers: { apikey: serviceRoleKey, authorization: `Bearer ${serviceRoleKey}`, "content-type": "application/json" },
    body: JSON.stringify({ p_check: check, p_limit: 2000 }),
  })
  if (!response.ok) throw new Error(`Planning lifecycle check ${check} failed with HTTP ${response.status}: ${await response.text()}`)
  const result = await response.json()
  if (Array.isArray(result)) rows.push(...result)
}

const high = rows.filter((row) => row.severity === "high")
const warnings = rows.filter((row) => row.severity === "warning")
const counts = rows.reduce((acc, row) => { acc[row.anomaly_type] = (acc[row.anomaly_type] ?? 0) + 1; return acc }, {})
const report = { generated_at: new Date().toISOString(), high_count: high.length, warning_count: warnings.length, anomaly_count: rows.length, checks_run: checks, counts, anomalies: rows }
fs.writeFileSync("planning-lifecycle-consistency-audit.json", `${JSON.stringify(report, null, 2)}\n`)
console.log(`Planning lifecycle consistency: ${high.length} high, ${warnings.length} warning across ${checks.length} isolated checks.`)
for (const [type, count] of Object.entries(counts)) console.log(`${type}: ${count}`)
if (high.length > 0) { console.error(`Planning lifecycle consistency audit found ${high.length} high-severity contradiction(s).`); process.exitCode = 2 }
