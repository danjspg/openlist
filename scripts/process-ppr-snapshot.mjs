import path from "path"
import { createClient } from "@supabase/supabase-js"
import { fileURLToPath } from "url"

import { ingestPprCsv, loadPprCsvRecords, summarisePprRecords } from "./ingest-ppr-csv.mjs"
import { formatErrorForLog } from "./ppr-error-format.mjs"

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!supabaseUrl || !serviceRoleKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY")
  process.exit(1)
}

const supabase = createClient(supabaseUrl, serviceRoleKey)
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, "..")

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

    if (error) throw new Error(`ppr_sales existing-hash lookup failed for ${year}: ${error.message}`)
    for (const row of data || []) {
      if (row.source_row_hash) existingHashes.add(row.source_row_hash)
    }
  }

  return records.filter((record) => !existingHashes.has(record.source_row_hash))
}

async function refreshLocalitySeoCohort() {
  const { error } = await supabase.rpc("openlist_refresh_locality_seo_cohorts")
  if (error) throw error
  console.log("Locality SEO cohort refreshed.")
}

async function main() {
  const [snapshotArg] = process.argv.slice(2)
  if (!snapshotArg) {
    console.error("Usage: node scripts/process-ppr-snapshot.mjs <path-to-current-year-csv>")
    process.exit(1)
  }

  const csvPath = path.resolve(repoRoot, snapshotArg)
  const yearMatch = path.basename(csvPath).match(/PPR-(\d{4})\.csv$/i)
  if (!yearMatch) throw new Error(`Cannot derive PPR year from ${csvPath}`)
  const year = Number(yearMatch[1])
  const sourceUrl = `https://www.propertypriceregister.ie/website/npsra/pprweb.nsf/PPRDownloads?County=ALL&Year=${year}&Month=ALL&OpenForm=&File=PPR-${year}.csv`

  const records = await loadPprCsvRecords(csvPath, { sourceUrl })
  const remoteSummary = summarisePprRecords(records)
  const newRecords = await filterToBrandNewRecords(records, year)
  const newSummary = summarisePprRecords(newRecords)

  console.log(`${year}: staged source rows ${remoteSummary.rowCount}, latest sale ${remoteSummary.latestSaleDate || "unknown"}, brand-new rows ${newRecords.length}`)

  if (newRecords.length === 0) {
    console.log("No brand-new sold-prices rows detected in the staged snapshot.")
    await refreshLocalitySeoCohort()
    return
  }

  console.log(`${year}: ingesting ${newRecords.length} brand-new row(s), latest new sale ${newSummary.latestSaleDate || "unknown"}.`)
  const result = await ingestPprCsv({
    csvPath,
    sourceUrl,
    skipRebuild: true,
    records: newRecords,
  })
  console.log(`${year}: imported ${result.insertedRows} new rows from ${result.processedRows} processed rows.`)
  await refreshLocalitySeoCohort()
}

main().catch((error) => {
  console.error("PPR snapshot processing failed:")
  console.error(formatErrorForLog(error))
  process.exit(1)
})
