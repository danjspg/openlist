import { access } from "fs/promises"
import { spawn } from "child_process"
import path from "path"
import { fileURLToPath } from "url"
import { createClient } from "@supabase/supabase-js"
import { ingestPprCsv, loadPprCsvRecords, summarisePprRecords } from "./ingest-ppr-csv.mjs"
import { formatErrorForLog } from "./ppr-error-format.mjs"
import { rebuildPprPhase1Analytics } from "./rebuild-ppr-phase1-analytics.mjs"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, "..")
const dataDir = path.join(repoRoot, "data", "ppr")

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !serviceRoleKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY")
  process.exit(1)
}

const supabase = createClient(supabaseUrl, serviceRoleKey)

function usage() {
  console.error("Usage: node scripts/refresh-ppr.mjs")
}

function downloadUrl(year) {
  return `https://www.propertypriceregister.ie/website/npsra/pprweb.nsf/PPRDownloads?County=ALL&Year=${year}&Month=ALL&OpenForm=&File=PPR-${year}.csv`
}

function csvPathForYear(year) {
  return path.join(dataDir, `PPR-${year}.csv`)
}

function formatCompletionTimestamp(date = new Date()) {
  const year = date.getUTCFullYear()
  const month = String(date.getUTCMonth() + 1).padStart(2, "0")
  const day = String(date.getUTCDate()).padStart(2, "0")
  const hours = String(date.getUTCHours()).padStart(2, "0")
  const minutes = String(date.getUTCMinutes()).padStart(2, "0")
  return `${year}-${month}-${day} ${hours}:${minutes}`
}

function logCompletion(rowsProcessed) {
  console.log("PPR refresh completed")
  console.log(`Rows processed: ${rowsProcessed}`)
  console.log(`Timestamp: ${formatCompletionTimestamp()}`)
}

async function runDownload(years) {
  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["scripts/download-ppr-csvs.mjs", ...years.map(String)], {
      cwd: repoRoot,
      env: process.env,
      stdio: "inherit",
    })

    child.on("error", reject)
    child.on("exit", (code) => {
      if (code === 0) resolve()
      else reject(new Error(`download exited with code ${code}`))
    })
  })
}

async function rebuildPprAreaSummaries() {
  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["scripts/rebuild-ppr-summaries.mjs"], {
      cwd: repoRoot,
      env: process.env,
      stdio: "inherit",
    })

    child.on("error", reject)
    child.on("exit", (code) => {
      if (code === 0) resolve()
      else reject(new Error(`rebuild-ppr-summaries exited with code ${code}`))
    })
  })
}

async function refreshDerivedPprTables() {
  console.log("Rebuilding PPR area summaries...")
  await rebuildPprAreaSummaries()
  console.log("PPR area summaries refreshed.")

  console.log("Rebuilding PPR analytics tables...")
  await rebuildPprPhase1Analytics()
  console.log("PPR analytics tables rebuilt.")
}

async function fileExists(filePath) {
  try {
    await access(filePath)
    return true
  } catch {
    return false
  }
}

function chunk(items, size) {
  const chunks = []
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size))
  }
  return chunks
}

async function filterToBrandNewRecords(records, year) {
  const existingHashes = new Set()
  const hashes = records.map((record) => record.source_row_hash).filter(Boolean)

  for (const hashBatch of chunk(hashes, 40)) {
    const { data, error } = await supabase
      .from("ppr_sales")
      .select("source_row_hash")
      .eq("year", year)
      .in("source_row_hash", hashBatch)

    if (error) {
      throw new Error(`ppr_sales existing-hash lookup failed for ${year}`, { cause: error })
    }

    for (const row of data || []) {
      if (row.source_row_hash) existingHashes.add(row.source_row_hash)
    }
  }

  return records.filter((record) => !existingHashes.has(record.source_row_hash))
}

const rawArgs = process.argv.slice(2)
if (rawArgs.length > 0) {
  usage()
  process.exit(1)
}

const year = new Date().getUTCFullYear()
const yearsToCheck = [year]

try {
  console.log("PPR refresh starting...")
  console.log(`Checking sold-prices source data for years: ${yearsToCheck.join(", ")}`)
  await runDownload(yearsToCheck)

  const filePath = csvPathForYear(year)
  const sourceUrl = downloadUrl(year)
  console.log(`${year}: expected CSV source ${sourceUrl}`)
  console.log(`${year}: expected local CSV path ${filePath}`)

  if (!(await fileExists(filePath))) {
    throw new Error(`${year}: source download did not produce ${filePath}. Aborting refresh.`)
  }

  const records = await loadPprCsvRecords(filePath, { sourceUrl })
  const remoteSummary = summarisePprRecords(records)
  const newRecords = await filterToBrandNewRecords(records, year)
  const newSummary = summarisePprRecords(newRecords)

  console.log(
    `${year}: source rows ${remoteSummary.rowCount}, latest sale ${remoteSummary.latestSaleDate || "unknown"}, brand-new rows ${newRecords.length}`
  )

  if (newRecords.length === 0) {
    console.log("No brand-new sold-prices rows detected for the current year.")
    console.log("Refreshing derived sold-prices tables to keep summaries in sync.")
    await refreshDerivedPprTables()
    logCompletion(0)
    process.exit(0)
  }

  console.log(
    `${year}: ingesting ${newRecords.length} brand-new row(s), latest new sale ${newSummary.latestSaleDate || "unknown"}.`
  )

  const result = await ingestPprCsv({
    csvPath: filePath,
    sourceUrl,
    skipRebuild: true,
    records: newRecords,
  })

  console.log(
    `${year}: Supabase insert/update result - imported ${result.insertedRows} new rows from ${result.processedRows} processed rows.`
  )

  await refreshDerivedPprTables()

  console.log(
    `Sold-prices refresh complete. Current-year source checked, ${result.insertedRows} new rows imported, ${result.processedRows} new rows processed.`
  )
  logCompletion(result.processedRows)
} catch (error) {
  console.error("PPR refresh failed:")
  console.error(formatErrorForLog(error))
  process.exit(1)
}
