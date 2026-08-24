import { readFile } from "node:fs/promises"

const report = JSON.parse(
  await readFile("planning-coverage-audit.json", "utf8")
)

if (!report.anomaly_count) {
  console.log("No unexplained council-level monthly coverage anomalies detected.")
  process.exit(0)
}

console.log(`Detected **${report.anomaly_count}** anomaly/anomalies:`)
console.log("")
console.log("| Council | Month | Count | Trailing 12m avg | Type |")
console.log("|---|---:|---:|---:|---|")

for (const row of report.anomalies) {
  console.log(
    `| ${row.local_authority_code} | ${String(row.anomaly_month).slice(0, 7)} | ${row.applications} | ${row.trailing_12_month_avg} | ${row.anomaly_type} |`
  )
}
