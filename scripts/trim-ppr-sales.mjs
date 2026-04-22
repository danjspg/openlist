import { mkdir, writeFile } from "fs/promises"
import path from "path"
import { createClient } from "@supabase/supabase-js"

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !serviceRoleKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY")
  process.exit(1)
}

const years = process.argv
  .slice(2)
  .map((value) => Number(value))
  .filter((value) => Number.isInteger(value) && value > 2000)
  .sort((a, b) => a - b)

if (years.length === 0) {
  console.error("Usage: node scripts/trim-ppr-sales.mjs <year> [year...]")
  process.exit(1)
}

const supabase = createClient(supabaseUrl, serviceRoleKey)
const backupDir = path.join(process.cwd(), "data", "ppr-backups")
const backupBaseName = `ppr_sales_backup_removed_${years.join("_")}`
const backupPath = path.join(backupDir, `${backupBaseName}.json`)
const metadataPath = path.join(backupDir, `${backupBaseName}.meta.json`)

function yearRange(year) {
  return {
    from: `${year}-01-01`,
    to: `${year + 1}-01-01`,
  }
}

async function countYear(year) {
  const { count, error } = await supabase
    .from("ppr_sales")
    .select("id", { count: "exact", head: true })
    .gte("date_of_sale", yearRange(year).from)
    .lt("date_of_sale", yearRange(year).to)

  if (error) throw error
  return count ?? 0
}

async function fetchYearRows(year) {
  const rows = []
  const pageSize = 1000
  let from = 0

  while (true) {
    const { data, error } = await supabase
      .from("ppr_sales")
      .select("*")
      .gte("date_of_sale", yearRange(year).from)
      .lt("date_of_sale", yearRange(year).to)
      .order("date_of_sale", { ascending: true })
      .order("id", { ascending: true })
      .range(from, from + pageSize - 1)

    if (error) throw error
    if (!data || data.length === 0) break

    rows.push(...data)

    if (data.length < pageSize) break
    from += pageSize
  }

  return rows
}

async function deleteYear(year) {
  const { error } = await supabase
    .from("ppr_sales")
    .delete()
    .gte("date_of_sale", yearRange(year).from)
    .lt("date_of_sale", yearRange(year).to)

  if (error) throw error
}

async function getDatasetSummary() {
  const [{ count, error: countError }, { data: earliest, error: earliestError }, { data: latest, error: latestError }] =
    await Promise.all([
      supabase.from("ppr_sales").select("id", { count: "exact", head: true }),
      supabase
        .from("ppr_sales")
        .select("date_of_sale")
        .order("date_of_sale", { ascending: true })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("ppr_sales")
        .select("date_of_sale")
        .order("date_of_sale", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ])

  if (countError) throw countError
  if (earliestError) throw earliestError
  if (latestError) throw latestError

  return {
    sales_count: count ?? 0,
    earliest_sale_date: earliest?.date_of_sale ?? null,
    latest_sale_date: latest?.date_of_sale ?? null,
  }
}

await mkdir(backupDir, { recursive: true })

const countsBefore = {}
for (const year of years) {
  countsBefore[year] = await countYear(year)
}

const backupRows = []
for (const year of years) {
  const yearRows = await fetchYearRows(year)
  backupRows.push(...yearRows)
  console.log(`Fetched ${yearRows.length} rows for ${year}`)
}

await writeFile(backupPath, `${JSON.stringify(backupRows, null, 2)}\n`, "utf8")
await writeFile(
  metadataPath,
  `${JSON.stringify(
    {
      created_at: new Date().toISOString(),
      years,
      row_counts_before_delete: countsBefore,
      backup_row_count: backupRows.length,
      backup_path: backupPath,
    },
    null,
    2
  )}\n`,
  "utf8"
)

for (const year of years) {
  await deleteYear(year)
  console.log(`Deleted ${year}`)
}

const countsAfter = {}
for (const year of years) {
  countsAfter[year] = await countYear(year)
}

const { error: refreshError } = await supabase.rpc("refresh_ppr_area_summaries")
if (refreshError) throw refreshError

const datasetSummary = await getDatasetSummary()

console.log(
  JSON.stringify(
    {
      backup_path: backupPath,
      metadata_path: metadataPath,
      deleted_years: years,
      row_counts_before_delete: countsBefore,
      row_counts_after_delete: countsAfter,
      dataset_summary: datasetSummary,
    },
    null,
    2
  )
)
