import fs from "node:fs"

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY")
}

const response = await fetch(`${supabaseUrl}/rest/v1/rpc/openlist_planning_coverage_anomalies`, {
  method: "POST",
  headers: {
    apikey: serviceRoleKey,
    authorization: `Bearer ${serviceRoleKey}`,
    "content-type": "application/json",
  },
  body: "{}",
})

if (!response.ok) {
  throw new Error(`Planning coverage audit RPC failed with HTTP ${response.status}: ${await response.text()}`)
}

const anomalies = await response.json()
const report = {
  generated_at: new Date().toISOString(),
  anomaly_count: Array.isArray(anomalies) ? anomalies.length : 0,
  anomalies: Array.isArray(anomalies) ? anomalies : [],
}

fs.writeFileSync("planning-coverage-audit.json", `${JSON.stringify(report, null, 2)}\n`)

if (report.anomaly_count === 0) {
  console.log("Planning coverage audit passed: no unexplained monthly coverage anomalies found.")
} else {
  console.error(`Planning coverage audit failed: ${report.anomaly_count} anomaly/anomalies found.`)
  for (const row of report.anomalies) {
    console.error(
      `${row.local_authority_code} ${row.anomaly_month}: ${row.applications} applications ` +
      `vs trailing 12-month average ${row.trailing_12_month_avg} (${row.anomaly_type})`
    )
  }
  process.exitCode = 2
}
