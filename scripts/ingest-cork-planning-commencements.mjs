import { createClient } from "@supabase/supabase-js"
import { formatErrorForLog } from "./ppr-error-format.mjs"

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

const SOURCE_URL =
  "https://opendata.housing.gov.ie/dataset/e06975e1-7d7a-4780-a521-c038a813c339/resource/73321efd-b9da-482b-9005-dbac08fa26df/download/dhlgh-monthly-commencements.csv"
const SOURCE_DATASET = "Residential Commencement Notices"
const LOCAL_AUTHORITY = "Cork County"
const LOCAL_AUTHORITY_CODE = "CORKCOCO"
const DEFAULT_MONTHS_BACK = 60

const MONTHS = [
  ["January", 1],
  ["February", 2],
  ["March", 3],
  ["April", 4],
  ["May", 5],
  ["June", 6],
  ["July", 7],
  ["August", 8],
  ["September", 9],
  ["October", 10],
  ["November", 11],
  ["December", 12],
]

if (!supabaseUrl || !serviceRoleKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY")
  process.exit(1)
}

const supabase = createClient(supabaseUrl, serviceRoleKey)

function formatMonth(year, month) {
  return `${year}-${String(month).padStart(2, "0")}-01`
}

function parseCsv(text) {
  const rows = []
  let row = []
  let value = ""
  let inQuotes = false

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i]
    const next = text[i + 1]

    if (char === '"' && inQuotes && next === '"') {
      value += '"'
      i += 1
    } else if (char === '"') {
      inQuotes = !inQuotes
    } else if (char === "," && !inQuotes) {
      row.push(value)
      value = ""
    } else if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") i += 1
      row.push(value)
      if (row.some((cell) => cell !== "")) rows.push(row)
      row = []
      value = ""
    } else {
      value += char
    }
  }

  if (value || row.length > 0) {
    row.push(value)
    if (row.some((cell) => cell !== "")) rows.push(row)
  }

  return rows
}

function numberValue(value) {
  const number = Number(String(value ?? "").replace(/,/g, "").trim())
  return Number.isFinite(number) ? Math.trunc(number) : 0
}

function rowsToObjects(rows) {
  const [headers, ...dataRows] = rows

  return dataRows.map((row) =>
    Object.fromEntries(headers.map((header, index) => [header, row[index] ?? ""]))
  )
}

async function fetchCommencementRecords() {
  const response = await fetch(SOURCE_URL, {
    headers: {
      "User-Agent": "OpenList Cork commencements importer",
    },
  })

  if (!response.ok) {
    throw new Error(`Commencements CSV request failed: HTTP ${response.status}`)
  }

  const objects = rowsToObjects(parseCsv(await response.text()))
  const records = []

  for (const row of objects) {
    if (row.LocalAuthority !== LOCAL_AUTHORITY) continue

    const year = Number(row.Year)
    if (!Number.isInteger(year)) continue

    for (const [monthName, month] of MONTHS) {
      const value = numberValue(row[monthName])
      const periodMonth = formatMonth(year, month)

      records.push({
        local_authority: LOCAL_AUTHORITY,
        local_authority_code: LOCAL_AUTHORITY_CODE,
        metric: row.Metric,
        period_month: periodMonth,
        year,
        month,
        value,
        source_url: SOURCE_URL,
        source_dataset: SOURCE_DATASET,
        source_payload: row,
        updated_at: new Date().toISOString(),
      })
    }
  }

  return records
}

function filterLastMonths(records, monthsBack) {
  if (!monthsBack) return records

  const populatedMonths = records
    .filter((record) => record.metric === "All Units" && record.value > 0)
    .map((record) => record.period_month)
    .sort()
  const latestMonth = populatedMonths.at(-1)
  if (!latestMonth) return records

  const cutoff = new Date(`${latestMonth}T00:00:00Z`)
  cutoff.setUTCMonth(cutoff.getUTCMonth() - (monthsBack - 1))
  const cutoffMonth = formatMonth(cutoff.getUTCFullYear(), cutoff.getUTCMonth() + 1)

  return records.filter(
    (record) => record.period_month >= cutoffMonth && record.period_month <= latestMonth
  )
}

function chunk(items, size) {
  const chunks = []
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size))
  return chunks
}

async function ingestPlanningCommencements({ monthsBack = DEFAULT_MONTHS_BACK } = {}) {
  const allRecords = await fetchCommencementRecords()
  const records = filterLastMonths(allRecords, monthsBack)
  let processed = 0

  for (const batch of chunk(records, 250)) {
    const { error } = await supabase
      .from("planning_commencements")
      .upsert(batch, {
        onConflict: "local_authority_code,metric,period_month",
      })

    if (error) {
      throw new Error(
        `planning_commencements upsert failed after ${processed}/${records.length} rows`,
        { cause: error }
      )
    }

    processed += batch.length
    console.log(`processed ${processed}/${records.length}`)
  }

  console.log(
    `Done. Processed ${records.length} Cork County commencement rows from ${SOURCE_DATASET}.`
  )

  return {
    processedRows: records.length,
    records,
  }
}

const isDirectRun = import.meta.url === `file://${process.argv[1]}`

if (isDirectRun) {
  const args = process.argv.slice(2)
  const monthsBackArg = args.find((arg) => arg.startsWith("--months="))
  const monthsBack = monthsBackArg
    ? Number(monthsBackArg.split("=")[1])
    : DEFAULT_MONTHS_BACK

  ingestPlanningCommencements({
    monthsBack: Number.isFinite(monthsBack) ? monthsBack : null,
  }).catch((error) => {
    console.error(formatErrorForLog(error))
    process.exit(1)
  })
}

export { fetchCommencementRecords, ingestPlanningCommencements }
