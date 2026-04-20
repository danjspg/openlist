import { createClient } from "@supabase/supabase-js"

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !serviceRoleKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY")
  process.exit(1)
}

const supabase = createClient(supabaseUrl, serviceRoleKey)

function median(values) {
  if (values.length === 0) return null

  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)

  if (sorted.length % 2 === 1) return sorted[middle]
  return (sorted[middle - 1] + sorted[middle]) / 2
}

function avg(values) {
  if (values.length === 0) return null
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function monthStart(value) {
  const date = new Date(`${value}T00:00:00Z`)
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(
    2,
    "0"
  )}-01`
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
  if (typeof error.message === "string") return error.message
  return JSON.stringify(error)
}

async function withRetry(label, fn) {
  let lastError = null

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      return await fn()
    } catch (error) {
      lastError = error

      if (attempt < 3) {
        const delayMs = attempt * 1500
        console.log(`${label}: ${describeError(error)}; retrying in ${delayMs}ms`)
        await new Promise((resolve) => setTimeout(resolve, delayMs))
      }
    }
  }

  throw lastError
}

async function loadAllSales() {
  const rows = []
  const pageSize = 1000
  const currentYear = new Date().getFullYear()

  for (let year = 2010; year <= currentYear; year += 1) {
    let from = 0
    let yearRows = 0

    while (true) {
      const { data, error } = await withRetry(`load sales ${year} ${from}`, () =>
        supabase
          .from("ppr_sales")
          .select("county,area_slug,date_of_sale,price_eur")
          .not("county", "is", null)
          .not("area_slug", "is", null)
          .gte("date_of_sale", `${year}-01-01`)
          .lt("date_of_sale", `${year + 1}-01-01`)
          .range(from, from + pageSize - 1)
      )

      if (error) throw error
      if (!data || data.length === 0) break

      rows.push(...data)
      yearRows += data.length

      if (data.length < pageSize) break
      from += pageSize
    }

    if (yearRows > 0) {
      console.log(`Loaded ${yearRows} sales for ${year}`)
    }
  }

  return rows
}

const sales = await loadAllSales()
console.log(`Loaded ${sales.length} sales for summaries`)

const areaGroups = new Map()
const monthlyGroups = new Map()

for (const sale of sales) {
  const price = Number(sale.price_eur)
  if (!Number.isFinite(price)) continue

  const areaKey = `${sale.county}||${sale.area_slug}`
  const monthKey = `${sale.county}||${sale.area_slug}||${monthStart(sale.date_of_sale)}`

  if (!areaGroups.has(areaKey)) {
    areaGroups.set(areaKey, {
      county: sale.county,
      area_slug: sale.area_slug,
      dates: [],
      prices: [],
    })
  }

  if (!monthlyGroups.has(monthKey)) {
    monthlyGroups.set(monthKey, {
      county: sale.county,
      area_slug: sale.area_slug,
      year_month: monthStart(sale.date_of_sale),
      prices: [],
    })
  }

  areaGroups.get(areaKey).dates.push(sale.date_of_sale)
  areaGroups.get(areaKey).prices.push(price)
  monthlyGroups.get(monthKey).prices.push(price)
}

const areaStats = Array.from(areaGroups.values()).map((group) => ({
  geography_type: "area",
  county: group.county,
  area_slug: group.area_slug,
  eircode_prefix: null,
  period_start: group.dates.sort()[0],
  period_end: group.dates.sort().at(-1),
  sales_count: group.prices.length,
  median_price_eur: median(group.prices),
  avg_price_eur: avg(group.prices),
  min_price_eur: Math.min(...group.prices),
  max_price_eur: Math.max(...group.prices),
  last_sale_date: group.dates.sort().at(-1),
}))

const monthlyStats = Array.from(monthlyGroups.values()).map((group) => ({
  county: group.county,
  area_slug: group.area_slug,
  year_month: group.year_month,
  sales_count: group.prices.length,
  median_price_eur: median(group.prices),
  avg_price_eur: avg(group.prices),
}))

let { error } = await withRetry("delete monthly summaries", () =>
  supabase
    .from("ppr_area_monthly")
    .delete()
    .not("id", "is", null)
)
if (error) throw error

;({ error } = await withRetry("delete area summaries", () =>
  supabase
    .from("ppr_area_stats")
    .delete()
    .not("id", "is", null)
))
if (error) throw error

for (const batch of chunk(monthlyStats, 500)) {
  const { error: insertError } = await withRetry("insert monthly summaries", () =>
    supabase
      .from("ppr_area_monthly")
      .insert(batch)
  )
  if (insertError) throw insertError
}

for (const batch of chunk(areaStats, 500)) {
  const { error: insertError } = await withRetry("insert area summaries", () =>
    supabase
      .from("ppr_area_stats")
      .insert(batch)
  )
  if (insertError) throw insertError
}

console.log(
  `PPR area summaries rebuilt. ${areaStats.length} areas, ${monthlyStats.length} monthly rows.`
)
