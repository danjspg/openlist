import fs from "node:fs"

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY")
}

const response = await fetch(`${supabaseUrl}/rest/v1/rpc/openlist_planning_lifecycle_inconsistencies`, {
  method: "POST",
  headers: {
    apikey: serviceRoleKey,
    authorization: `Bearer ${serviceRoleKey}`,
    "content-type": "application/json",
  },
  body: "{}",
})

if (!response.ok) {
  throw new Error(`Planning lifecycle consistency audit failed with HTTP ${response.status}: ${await response.text()}`)
}

const anomalies = await response.json()
const rows = Array.isArray(anomalies) ? anomalies : []
const high = rows.filter((row) => row.severity === "high")
const warnings = rows.filter((row) => row.severity === "warning")
const counts = rows.reduce((acc, row) => {
  acc[row.anomaly_type] = (acc[row.anomaly_type] ?? 0) + 1
  return acc
}, {})

const report = {
  generated_at: new Date().toISOString(),
  high_count: high.length,
  warning_count: warnings.length,
  anomaly_count: rows.length,
  counts,
  anomalies: rows,
}

fs.writeFileSync("planning-lifecycle-consistency-audit.json", `${JSON.stringify(report, null, 2)}\n`)

console.log(`Planning lifecycle consistency: ${high.length} high, ${warnings.length} warning.`)
for (const [type, count] of Object.entries(counts)) {
  console.log(`${type}: ${count}`)
}

if (high.length > 0) {
  console.error(`Planning lifecycle consistency audit found ${high.length} high-severity contradiction(s).`)
  process.exitCode = 2
}
