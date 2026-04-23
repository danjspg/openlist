import { createHash } from "crypto"
import { readFile } from "fs/promises"
import { fileURLToPath } from "url"
import { createClient } from "@supabase/supabase-js"
import { rebuildPprPhase1Analytics } from "./rebuild-ppr-phase1-analytics.mjs"

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const DEFAULT_SOURCE_URL = "https://www.propertypriceregister.ie/"

if (!supabaseUrl || !serviceRoleKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY")
  process.exit(1)
}

const supabase = createClient(supabaseUrl, serviceRoleKey)

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
      continue
    }

    if (char === '"') {
      inQuotes = !inQuotes
      continue
    }

    if (char === "," && !inQuotes) {
      row.push(value)
      value = ""
      continue
    }

    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") i += 1
      row.push(value)
      if (row.some((item) => item.trim().length > 0)) rows.push(row)
      row = []
      value = ""
      continue
    }

    value += char
  }

  row.push(value)
  if (row.some((item) => item.trim().length > 0)) rows.push(row)
  return rows
}

function slugify(input) {
  return input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/['']/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
}

function parsePrice(value) {
  const numeric = Number(String(value).replace(/[^0-9.]/g, ""))
  return Number.isFinite(numeric) ? numeric : null
}

function parseIrishDate(value) {
  const [day, month, year] = String(value).split("/").map(Number)
  if (!day || !month || !year) return null
  return `${year.toString().padStart(4, "0")}-${month
    .toString()
    .padStart(2, "0")}-${day.toString().padStart(2, "0")}`
}

function normaliseBoolean(value) {
  const normalised = String(value || "").trim().toLowerCase()
  if (!normalised) return null
  if (["yes", "y", "true", "1"].includes(normalised)) return true
  if (["no", "n", "false", "0"].includes(normalised)) return false
  return null
}

function getPriceValue(record) {
  if (record.Price) return record.Price

  const priceKey = Object.keys(record).find((key) =>
    key.trim().toLowerCase().startsWith("price")
  )

  return priceKey ? record[priceKey] : ""
}

function mapRow(headers, row, sourceUrl = DEFAULT_SOURCE_URL) {
  const record = Object.fromEntries(
    headers.map((header, index) => [header.trim(), row[index]?.trim() || ""])
  )

  const dateOfSale = parseIrishDate(record["Date of Sale (dd/mm/yyyy)"])
  const priceValue = getPriceValue(record)
  const price = parsePrice(priceValue)
  const address = record.Address
  const county = record.County
  const eircode = record.Eircode || null

  if (!dateOfSale || !price || !address) return null

  const date = new Date(`${dateOfSale}T00:00:00Z`)
  const addressParts = address
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
  const rawLocality =
    addressParts.length >= 2
      ? addressParts[addressParts.length - 2]
      : addressParts[0] || null
  const locality =
    rawLocality && county && rawLocality.toLowerCase() === county.toLowerCase()
      ? null
      : rawLocality
  const areaSlug = locality ? slugify(locality) : county ? slugify(county) : null
  const propertyDescription = record["Description of Property"] || ""
  const isNewDwelling = propertyDescription
    ? propertyDescription.toLowerCase().includes("new dwelling")
    : null
  const vatExclusive =
    "VAT Exclusive" in record && record["VAT Exclusive"]
      ? normaliseBoolean(record["VAT Exclusive"])
      : null
  const sourceRowHash = createHash("sha256")
    .update(JSON.stringify(record))
    .digest("hex")

  return {
    source_row_hash: sourceRowHash,
    date_of_sale: dateOfSale,
    address_raw: address,
    address_normalised: address.replace(/\s+/g, " ").trim().toUpperCase(),
    locality,
    county,
    eircode,
    eircode_prefix: eircode ? eircode.slice(0, 3).toUpperCase() : null,
    price_eur: price,
    price_display: priceValue,
    property_description_raw: propertyDescription || null,
    is_new_dwelling: isNewDwelling,
    vat_exclusive: vatExclusive,
    source_url: sourceUrl,
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    area_slug: areaSlug,
  }
}

function chunk(items, size) {
  const chunks = []
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size))
  return chunks
}

function describeError(error) {
  if (!error) return "Unknown error"
  if (error instanceof Error) return error.message
  if (typeof error === "string") return error
  if (typeof error.message === "string" && error.message) return error.message
  try {
    return JSON.stringify(error)
  } catch {
    return String(error)
  }
}

function latestSaleDate(records) {
  return records.reduce((latest, record) => {
    if (!record.date_of_sale) return latest
    if (!latest || record.date_of_sale > latest) return record.date_of_sale
    return latest
  }, null)
}

function summarisePprRecords(records) {
  return {
    years: Array.from(new Set(records.map((record) => record.year).filter(Boolean))).sort(),
    latestSaleDate: latestSaleDate(records),
    rowCount: records.length,
  }
}

async function countSalesByYears(years) {
  const counts = new Map()

  for (const year of years) {
    const { count, error } = await supabase
      .from("ppr_sales")
      .select("id", { count: "exact", head: true })
      .eq("year", year)

    if (error) throw error
    counts.set(year, count || 0)
  }

  return counts
}

async function loadPprCsvRecords(csvPath, { sourceUrl = DEFAULT_SOURCE_URL } = {}) {
  const csv = await readFile(csvPath, "utf8")
  const [headers, ...rows] = parseCsv(csv)
  return rows.map((row) => mapRow(headers, row, sourceUrl)).filter(Boolean)
}

async function ingestPprCsv({
  csvPath,
  sourceUrl = DEFAULT_SOURCE_URL,
  skipRebuild = false,
  records: providedRecords,
} = {}) {
  if (!csvPath && !providedRecords) {
    throw new Error("csvPath or records is required")
  }

  const records = providedRecords || (await loadPprCsvRecords(csvPath, { sourceUrl }))
  const summary = summarisePprRecords(records)
  const countsBefore = await countSalesByYears(summary.years)

  for (const year of summary.years) {
    const yearRecords = records.filter((record) => record.year === year)
    let processed = 0

    for (const batch of chunk(yearRecords, 100)) {
      const { error } = await supabase
        .from("ppr_sales")
        .upsert(batch, { onConflict: "source_row_hash", ignoreDuplicates: true })

      if (error) {
        throw new Error(`ppr_sales upsert failed for ${year}: ${describeError(error)}`)
      }
      processed += batch.length
      console.log(`${year}: processed ${processed}/${yearRecords.length}`)
    }
  }

  const countsAfter = await countSalesByYears(summary.years)
  const importedByYear = summary.years.map((year) => {
    const importedRows = Math.max(0, (countsAfter.get(year) || 0) - (countsBefore.get(year) || 0))
    console.log(`${year}: imported ${importedRows} new rows (${countsAfter.get(year) || 0} total for year)`)
    return { year, importedRows, totalRows: countsAfter.get(year) || 0 }
  })
  const insertedRows = importedByYear.reduce((sum, item) => sum + item.importedRows, 0)

  console.log(
    `Done. Processed ${summary.rowCount} PPR rows, imported ${insertedRows} new rows, latest sale ${summary.latestSaleDate || "unknown"}.`
  )

  if (!skipRebuild) {
    console.log("Refreshing PPR area summaries...")
    const { error: refreshError } = await supabase.rpc("refresh_ppr_area_summaries")

    if (refreshError) {
      throw refreshError
    }

    console.log("PPR area summaries refreshed.")

    console.log("Rebuilding PPR analytics tables...")
    await rebuildPprPhase1Analytics()
    console.log("PPR analytics tables rebuilt.")
  }

  return {
    importedByYear,
    insertedRows,
    latestSaleDate: summary.latestSaleDate,
    processedRows: summary.rowCount,
    years: summary.years,
  }
}

const isDirectRun = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]

if (isDirectRun) {
  const cliArgs = process.argv.slice(2)
  const skipRebuild = cliArgs.includes("--skip-rebuild")
  const positionalArgs = cliArgs.filter((arg) => arg !== "--skip-rebuild")
  const [csvPath, sourceUrl = DEFAULT_SOURCE_URL] = positionalArgs

  if (!csvPath) {
    console.error("Usage: node scripts/ingest-ppr-csv.mjs [--skip-rebuild] <path-to-csv> [source-url]")
    process.exit(1)
  }

  ingestPprCsv({ csvPath, sourceUrl, skipRebuild }).catch((error) => {
    console.error(describeError(error))
    process.exit(1)
  })
}

export { ingestPprCsv, loadPprCsvRecords, summarisePprRecords }
