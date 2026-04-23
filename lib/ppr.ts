import { unstable_cache } from "next/cache"
import { getServerSupabase, supabase } from "@/lib/supabase"
import { IRISH_COUNTIES } from "@/lib/property"
import { dublinDistrictPrefix, type PprMarket } from "@/lib/ppr-markets"

export type PprSale = {
  id: string
  date_of_sale: string
  address_raw: string
  address_normalised?: string | null
  locality?: string | null
  county?: string | null
  eircode?: string | null
  eircode_prefix?: string | null
  price_eur: number | string
  price_display?: string | null
  property_description_raw?: string | null
  is_new_dwelling?: boolean | null
  vat_exclusive?: boolean | null
  source_url?: string | null
  year?: number | null
  month?: number | null
  area_slug?: string | null
}

export type PprAreaStats = {
  id: string
  geography_type?: string | null
  county?: string | null
  area_slug?: string | null
  eircode_prefix?: string | null
  period_start?: string | null
  period_end?: string | null
  sales_count?: number | null
  median_price_eur?: number | string | null
  avg_price_eur?: number | string | null
  min_price_eur?: number | string | null
  max_price_eur?: number | string | null
  last_sale_date?: string | null
}

export type PprAreaMonthly = {
  id: string
  county?: string | null
  area_slug?: string | null
  year_month?: string | null
  sales_count?: number | null
  median_price_eur?: number | string | null
  avg_price_eur?: number | string | null
}

export type PprSearchFilters = {
  county?: string
  area?: string
  minPrice?: string
  maxPrice?: string
  dateFrom?: string
  dateTo?: string
  dateRange?: string
  sort?: string
  newBuild?: string
  propertyStyle?: string
  page?: string
}

export type PprSearchSummary = {
  count: number
  latestSaleDate: string | null
}

export type PprDatasetSummary = {
  salesCount: number
  earliestSaleDate: string | null
  latestSaleDate: string | null
  startYear: number | null
}

export const PPR_PAGE_SIZE = 12
const PPR_CACHE_REVALIDATE_SECONDS = 60 * 60 * 6
const PPR_DATASET_CACHE_VERSION = "v3"
export const PPR_DATE_RANGE_OPTIONS = [
  { value: "last-year", label: "1 Year", years: 1 },
  { value: "last-3-years", label: "3 Years", years: 3 },
  { value: "last-5-years", label: "5 Years", years: 5 },
  { value: "all", label: "All Time", years: null },
] as const

export type PprDateRangeValue = (typeof PPR_DATE_RANGE_OPTIONS)[number]["value"]

export function formatPprDateInput(date: Date) {
  return date.toISOString().slice(0, 10)
}

function yearFromDateString(value?: string | null) {
  if (!value) return null
  const [year] = value.split("-")
  const parsed = Number(year)
  return Number.isInteger(parsed) ? parsed : null
}

export function getPprDateRangePreset(range: PprDateRangeValue = "last-year") {
  const to = new Date()

  if (range === "all") {
    return {
      dateFrom: "",
      dateTo: "",
      dateRange: "all" as const,
    }
  }

  const years = range === "last-3-years" ? 3 : range === "last-5-years" ? 5 : 1
  const from = new Date(to)
  from.setFullYear(from.getFullYear() - years)

  return {
    dateFrom: formatPprDateInput(from),
    dateTo: formatPprDateInput(to),
    dateRange: range,
  }
}

export function getDefaultPprDateRange() {
  const to = new Date()
  const from = new Date(to)
  from.setFullYear(from.getFullYear() - 1)

  return {
    dateFrom: formatPprDateInput(from),
    dateTo: formatPprDateInput(to),
    dateRange: "last-year",
  }
}

export function withDefaultPprSearchFilters(filters: PprSearchFilters = {}) {
  if (
    filters.dateFrom ||
    filters.dateTo ||
    filters.dateRange === "all" ||
    filters.dateRange === "last-5-years" ||
    filters.dateRange === "last-3-years" ||
    filters.dateRange === "last-year"
  ) {
    const preset =
      filters.dateRange && !filters.dateFrom && !filters.dateTo
        ? getPprDateRangePreset(filters.dateRange as PprDateRangeValue)
        : {}

    return {
      ...filters,
      ...preset,
      sort: filters.sort || "newest",
    }
  }

  return {
    ...filters,
    ...getDefaultPprDateRange(),
    sort: filters.sort || "newest",
  }
}

export function areaSlug(input: string) {
  return input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/['']/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
}

export function areaNameFromSlug(slug: string) {
  return slug
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ")
}

export function formatPprCurrency(value?: number | string | null) {
  const numeric =
    typeof value === "number"
      ? value
      : Number(String(value ?? "").replace(/[^0-9.]/g, ""))

  if (!Number.isFinite(numeric)) return "—"

  return new Intl.NumberFormat("en-IE", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(numeric)
}

export function formatPprDate(value?: string | null) {
  if (!value) return "—"

  const dateOnlyMatch = String(value).match(/^(\d{4})-(\d{2})-(\d{2})$/)
  const date = dateOnlyMatch
    ? new Date(
        Date.UTC(
          Number(dateOnlyMatch[1]),
          Number(dateOnlyMatch[2]) - 1,
          Number(dateOnlyMatch[3])
        )
      )
    : new Date(value)
  if (Number.isNaN(date.getTime())) return "—"

  return new Intl.DateTimeFormat("en-IE", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(date)
}

export function compactAddress(address: string) {
  return address
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .join(", ")
}

function collapseWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim()
}

function looksLikeUppercase(value: string) {
  const letters = value.replace(/[^A-Za-z]/g, "")
  return letters.length > 0 && letters === letters.toUpperCase()
}

function titleCaseToken(token: string) {
  const lower = token.toLowerCase()

  if (["and", "of", "the", "on"].includes(lower)) return lower
  if (["rd", "st", "ave", "dr", "ct", "sq", "pk", "apt"].includes(lower)) {
    return lower.charAt(0).toUpperCase() + lower.slice(1)
  }

  return lower
    .split("-")
    .map((part) => (part ? part.charAt(0).toUpperCase() + part.slice(1) : part))
    .join("-")
}

export function formatPprDisplayText(value?: string | null) {
  const collapsed = collapseWhitespace(String(value || ""))
  if (!collapsed) return ""

  if (!looksLikeUppercase(collapsed)) return collapsed

  return collapsed
    .split(/(\s+|, )/)
    .map((token) => {
      if (!token.trim()) return token
      if (token === ",") return token
      if (/^\s+$/.test(token) || token === ", ") return token
      return titleCaseToken(token)
    })
    .join("")
}

export function getComparableSaleDisplayLabel(
  sale: Pick<PprSale, "address_raw" | "locality" | "county" | "area_slug">
) {
  const address = formatPprDisplayText(compactAddress(sale.address_raw || ""))
  const locality = formatPprDisplayText(sale.locality)
  const county = formatPprDisplayText(sale.county)
  const area = sale.area_slug ? formatPprDisplayText(areaNameFromSlug(sale.area_slug)) : ""

  if (address) return address

  if (locality && county && locality.toLowerCase() !== county.toLowerCase()) {
    return `${locality}, ${county}`
  }

  if (locality) return locality

  if (area && county && area.toLowerCase() !== county.toLowerCase()) {
    return `${area}, ${county}`
  }

  if (area) return area
  if (county) return county

  return "Nearby sale"
}

export function formatPropertyTags(sale: Pick<
  PprSale,
  "property_description_raw" | "vat_exclusive"
>) {
  const description = String(sale.property_description_raw || "").toLowerCase()
  const propertyType = description.includes("house")
    ? "House"
    : description.includes("apartment")
      ? "Apartment"
      : "Property"
  const condition = description.includes("new") ? "New build" : "Second-hand"
  const tags = [propertyType, condition]

  if (condition === "New build" && sale.vat_exclusive !== null && sale.vat_exclusive !== undefined) {
    tags.push(sale.vat_exclusive ? "VAT exclusive" : "VAT included")
  }

  return tags
}

function numericFilter(value?: string) {
  if (!value) return null
  const parsed = Number(value.replace(/[^0-9.]/g, ""))
  return Number.isFinite(parsed) ? parsed : null
}

function safePage(value?: string) {
  const page = Number(value)
  return Number.isInteger(page) && page > 0 ? page : 1
}

function sortOption(value?: string) {
  switch (value) {
    case "oldest":
    case "price-high":
    case "price-low":
      return value
    default:
      return "newest"
  }
}

function uniqueValues(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)))
}

function areaSearchTerms(input: string) {
  const trimmed = input.trim()
  const commaParts = trimmed
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)

  return uniqueValues([trimmed, ...commaParts])
}

function textSearchTerms(terms: string[]) {
  return uniqueValues(
    terms
      .map((term) => term.replace(/,/g, " ").replace(/\s+/g, " ").trim())
      .filter((term) => term.length >= 3)
  )
}

export function broadAreaFilterExpression(areaSlugValue: string, label: string) {
  const terms = areaSearchTerms(label)
  const textTerms = textSearchTerms(terms)
  const filters = [`area_slug.eq.${areaSlugValue}`]

  for (const term of textTerms) {
    filters.push(`locality.ilike.%${term}%`)
    filters.push(`address_raw.ilike.%${term}%`)
  }

  return filters.join(",")
}

function localityAreaFilterExpression(input: string, includeCounty = true) {
  const terms = areaSearchTerms(input)
  const slugs = uniqueValues(terms.map(areaSlug))
  const textTerms = textSearchTerms(terms)
  const eircodePrefixes = eircodePrefixTerms(terms)
  const counties = includeCounty ? countySearchTerms(terms) : []
  const filters: string[] = []

  if (slugs.length === 1) filters.push(`area_slug.eq.${slugs[0]}`)
  if (slugs.length > 1) filters.push(`area_slug.in.(${slugs.join(",")})`)

  if (eircodePrefixes.length === 1) filters.push(`eircode_prefix.eq.${eircodePrefixes[0]}`)
  if (eircodePrefixes.length > 1) {
    filters.push(`eircode_prefix.in.(${eircodePrefixes.join(",")})`)
  }

  if (counties.length === 1) filters.push(`county.eq.${counties[0]}`)
  if (counties.length > 1) filters.push(`county.in.(${counties.join(",")})`)

  for (const term of textTerms) {
    filters.push(`locality.ilike.%${term}%`)
  }

  return filters.join(",")
}

function countySearchTerms(terms: string[]) {
  const counties = IRISH_COUNTIES.map((county) => ({
    county,
    slug: areaSlug(county),
  }))

  return uniqueValues(
    terms
      .map((term) => areaSlug(term.replace(/^co(?:unty)?\.?\s+/i, "")))
      .map((slug) => counties.find((item) => item.slug === slug)?.county || "")
  )
}

function eircodePrefixTerms(terms: string[]) {
  return uniqueValues(
    terms
      .map((term) => term.trim().toUpperCase().replace(/\s+/g, ""))
      .filter((term) => /^[A-Z][0-9]{2}$/.test(term) || /^[A-Z][0-9][A-Z0-9]$/.test(term))
  )
}

function areaFilterExpression(input: string, includeCounty = true) {
  const terms = areaSearchTerms(input)
  const slugs = uniqueValues(terms.map(areaSlug))
  const textTerms = textSearchTerms(terms)
  const eircodePrefixes = eircodePrefixTerms(terms)
  const counties = includeCounty ? countySearchTerms(terms) : []
  const filters: string[] = []

  if (slugs.length === 1) filters.push(`area_slug.eq.${slugs[0]}`)
  if (slugs.length > 1) filters.push(`area_slug.in.(${slugs.join(",")})`)

  if (eircodePrefixes.length === 1) filters.push(`eircode_prefix.eq.${eircodePrefixes[0]}`)
  if (eircodePrefixes.length > 1) {
    filters.push(`eircode_prefix.in.(${eircodePrefixes.join(",")})`)
  }

  if (counties.length === 1) filters.push(`county.eq.${counties[0]}`)
  if (counties.length > 1) filters.push(`county.in.(${counties.join(",")})`)

  for (const term of textTerms) {
    filters.push(`locality.ilike.%${term}%`)
    filters.push(`address_raw.ilike.%${term}%`)
  }

  return filters.join(",")
}

export function areaFilterExpressions(input: string, includeCounty = true) {
  return {
    broad: areaFilterExpression(input, includeCounty),
    fallback: localityAreaFilterExpression(input, includeCounty),
  }
}

export function isStatementTimeoutError(error?: { message?: string } | null) {
  return Boolean(error?.message?.toLowerCase().includes("statement timeout"))
}

function propertyStyleFilterExpression(style?: string) {
  switch (style) {
    case "apartment":
      return "address_raw.ilike.%apartment%,address_raw.ilike.%apt%"
    case "detached":
      return "property_description_raw.ilike.%detached%,address_raw.ilike.%detached%"
    case "semi-detached":
      return "property_description_raw.ilike.%semi-detached%,address_raw.ilike.%semi-detached%,address_raw.ilike.%semi detached%"
    default:
      return ""
  }
}

export async function getPprCounties() {
  const { data, error } = await supabase
    .from("ppr_sales")
    .select("county")
    .not("county", "is", null)
    .order("county", { ascending: true })
    .limit(1000)

  if (error || !data) return []

  return Array.from(
    new Set(
      data
        .map((row) => String(row.county || "").trim())
        .filter(Boolean)
    )
  )
}

async function getPprQuickAreasUncached(limit = 8) {
  const { data, error } = await supabase
    .from("ppr_area_stats")
    .select("county,area_slug,sales_count,median_price_eur,last_sale_date")
    .not("county", "is", null)
    .not("area_slug", "is", null)
    .order("sales_count", { ascending: false })
    .limit(limit)

  if (error || !data) return []
  return data as PprAreaStats[]
}

const getPprQuickAreasCached = unstable_cache(
  async (limit = 8) => getPprQuickAreasUncached(limit),
  ["ppr-quick-areas"],
  { revalidate: PPR_CACHE_REVALIDATE_SECONDS }
)

export async function getPprQuickAreas(limit = 8) {
  return getPprQuickAreasCached(limit)
}

async function getPprDatasetSummaryUncached(): Promise<PprDatasetSummary> {
  const serverSupabase = getServerSupabase()
  const [{ count, error: countError }, { data: earliest }, { data: latest }] = await Promise.all([
    serverSupabase.from("ppr_sales").select("id", { count: "exact", head: true }),
    serverSupabase
      .from("ppr_sales")
      .select("date_of_sale")
      .order("date_of_sale", { ascending: true })
      .limit(1)
      .maybeSingle(),
    serverSupabase
      .from("ppr_sales")
      .select("date_of_sale,price_eur")
      .order("date_of_sale", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ])

  const earliestSaleDate = earliest?.date_of_sale ?? null
  let salesCount = count ?? 0

  // If we can see dated rows but the cached/exact count path reports zero,
  // retry with an estimated count so the top-level stats do not show a false empty dataset.
  if ((salesCount === 0 || countError) && latest?.date_of_sale) {
    const { count: estimatedCount } = await serverSupabase
      .from("ppr_sales")
      .select("date_of_sale", { count: "estimated", head: true })

    if (estimatedCount) {
      salesCount = estimatedCount
    }
  }

  return {
    salesCount,
    earliestSaleDate,
    latestSaleDate: latest?.date_of_sale ?? null,
    startYear: yearFromDateString(earliestSaleDate),
  }
}

const getPprDatasetSummaryCached = unstable_cache(
  async () => getPprDatasetSummaryUncached(),
  ["ppr-dataset-summary", PPR_DATASET_CACHE_VERSION],
  { revalidate: PPR_CACHE_REVALIDATE_SECONDS }
)

export async function getPprDatasetSummary(): Promise<PprDatasetSummary> {
  return getPprDatasetSummaryCached()
}

export function buildPprDatasetDescription(summary: Pick<PprDatasetSummary, "salesCount" | "startYear">) {
  const formattedCount = new Intl.NumberFormat("en-IE").format(summary.salesCount)

  if (summary.startYear) {
    return `Search over ${formattedCount} public property sales since ${summary.startYear}.`
  }

  return `Search over ${formattedCount} public property sales.`
}

async function getPprKpisUncached() {
  const summary = await getPprDatasetSummary()
  const serverSupabase = getServerSupabase()

  const { data: latest } = await serverSupabase
    .from("ppr_sales")
    .select("date_of_sale,price_eur")
    .order("date_of_sale", { ascending: false })
    .limit(1)
    .maybeSingle()

  return {
    salesCount: summary.salesCount,
    earliestSaleDate: summary.earliestSaleDate,
    startYear: summary.startYear,
    latestSaleDate: latest?.date_of_sale ?? summary.latestSaleDate,
    latestSalePrice: latest?.price_eur ?? null,
    countyCount: 26,
  }
}

const getPprKpisCached = unstable_cache(async () => getPprKpisUncached(), ["ppr-kpis", PPR_DATASET_CACHE_VERSION], {
  revalidate: PPR_CACHE_REVALIDATE_SECONDS,
})

export async function getPprKpis() {
  return getPprKpisCached()
}

export async function searchPprSales(filters: PprSearchFilters) {
  const resolvedFilters = withDefaultPprSearchFilters(filters)
  const page = safePage(resolvedFilters.page)
  const from = (page - 1) * PPR_PAGE_SIZE
  const to = from + PPR_PAGE_SIZE - 1
  const sort = sortOption(resolvedFilters.sort)

  let query = supabase
    .from("ppr_sales")
    .select("*")
    .range(from, to)

  if (sort === "oldest") {
    query = query.order("date_of_sale", { ascending: true })
  } else if (sort === "price-high") {
    query = query.order("price_eur", { ascending: false })
  } else if (sort === "price-low") {
    query = query.order("price_eur", { ascending: true })
  } else {
    query = query.order("date_of_sale", { ascending: false })
  }

  const minPrice = numericFilter(resolvedFilters.minPrice)
  const maxPrice = numericFilter(resolvedFilters.maxPrice)

  if (resolvedFilters.county) {
    query = query.ilike("county", resolvedFilters.county)
  }

  if (resolvedFilters.area) {
    const area = resolvedFilters.area.trim()
    if (area) {
      const expressions = areaFilterExpressions(area, !resolvedFilters.county)
      if (expressions.broad) query = query.or(expressions.broad)
    }
  }

  if (minPrice !== null) query = query.gte("price_eur", minPrice)
  if (maxPrice !== null) query = query.lte("price_eur", maxPrice)
  if (resolvedFilters.dateFrom) query = query.gte("date_of_sale", resolvedFilters.dateFrom)
  if (resolvedFilters.dateTo) query = query.lte("date_of_sale", resolvedFilters.dateTo)
  if (resolvedFilters.newBuild === "true") query = query.eq("is_new_dwelling", true)

  const propertyStyleExpression = propertyStyleFilterExpression(
    resolvedFilters.propertyStyle
  )
  if (propertyStyleExpression) query = query.or(propertyStyleExpression)

  let { data, error } = await query

  if (error && resolvedFilters.area && isStatementTimeoutError(error)) {
    const area = resolvedFilters.area.trim()
    const expressions = areaFilterExpressions(area, !resolvedFilters.county)

    if (expressions.fallback && expressions.fallback !== expressions.broad) {
      let fallbackQuery = supabase.from("ppr_sales").select("*").range(from, to)

      if (sort === "oldest") {
        fallbackQuery = fallbackQuery.order("date_of_sale", { ascending: true })
      } else if (sort === "price-high") {
        fallbackQuery = fallbackQuery.order("price_eur", { ascending: false })
      } else if (sort === "price-low") {
        fallbackQuery = fallbackQuery.order("price_eur", { ascending: true })
      } else {
        fallbackQuery = fallbackQuery.order("date_of_sale", { ascending: false })
      }

      if (resolvedFilters.county) {
        fallbackQuery = fallbackQuery.ilike("county", resolvedFilters.county)
      }

      fallbackQuery = fallbackQuery.or(expressions.fallback)

      if (minPrice !== null) fallbackQuery = fallbackQuery.gte("price_eur", minPrice)
      if (maxPrice !== null) fallbackQuery = fallbackQuery.lte("price_eur", maxPrice)
      if (resolvedFilters.dateFrom) fallbackQuery = fallbackQuery.gte("date_of_sale", resolvedFilters.dateFrom)
      if (resolvedFilters.dateTo) fallbackQuery = fallbackQuery.lte("date_of_sale", resolvedFilters.dateTo)
      if (resolvedFilters.newBuild === "true") fallbackQuery = fallbackQuery.eq("is_new_dwelling", true)
      if (propertyStyleExpression) fallbackQuery = fallbackQuery.or(propertyStyleExpression)

      const fallbackResult = await fallbackQuery
      data = fallbackResult.data
      error = fallbackResult.error
    }
  }

  if (error) {
    return { sales: [] as PprSale[], count: 0, page, error: error.message }
  }

  return {
    sales: (data ?? []) as PprSale[],
    count: (data ?? []).length,
    page,
    error: "",
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function applySearchSummaryFilters(query: any, options: {
  resolvedFilters: ReturnType<typeof withDefaultPprSearchFilters>
  areaExpression?: string
  minPrice: number | null
  maxPrice: number | null
  propertyStyleExpression: string
}) {
  const { resolvedFilters, areaExpression, minPrice, maxPrice, propertyStyleExpression } = options

  if (resolvedFilters.county) {
    query = query.ilike("county", resolvedFilters.county)
  }

  if (areaExpression) {
    query = query.or(areaExpression)
  }

  if (minPrice !== null) {
    query = query.gte("price_eur", minPrice)
  }

  if (maxPrice !== null) {
    query = query.lte("price_eur", maxPrice)
  }

  if (resolvedFilters.dateFrom) {
    query = query.gte("date_of_sale", resolvedFilters.dateFrom)
  }

  if (resolvedFilters.dateTo) {
    query = query.lte("date_of_sale", resolvedFilters.dateTo)
  }

  if (resolvedFilters.newBuild === "true") {
    query = query.eq("is_new_dwelling", true)
  }

  if (propertyStyleExpression) {
    query = query.or(propertyStyleExpression)
  }

  return query
}

async function countSearchResultsByPaging(options: {
  resolvedFilters: ReturnType<typeof withDefaultPprSearchFilters>
  areaExpression?: string
  minPrice: number | null
  maxPrice: number | null
  propertyStyleExpression: string
}) {
  const pageSize = 1000
  let total = 0

  for (let offset = 0; ; offset += pageSize) {
    let query = supabase.from("ppr_sales").select("id").range(offset, offset + pageSize - 1)
    query = applySearchSummaryFilters(query, options)

    const { data, error } = await query
    if (error) return null

    const batchSize = (data ?? []).length
    total += batchSize

    if (batchSize < pageSize) break
  }

  return total
}

async function getPprSearchSummaryUncached(
  filters: PprSearchFilters
): Promise<PprSearchSummary> {
  const resolvedFilters = withDefaultPprSearchFilters(filters)
  const minPrice = numericFilter(resolvedFilters.minPrice)
  const maxPrice = numericFilter(resolvedFilters.maxPrice)
  const shouldUseExactCount = Boolean(
    resolvedFilters.area ||
      resolvedFilters.county ||
      resolvedFilters.minPrice ||
      resolvedFilters.maxPrice ||
      resolvedFilters.newBuild === "true" ||
      resolvedFilters.propertyStyle
  )
  const countMode = shouldUseExactCount ? "exact" : "estimated"

  let countQuery = supabase
    .from("ppr_sales")
    .select("id", { count: countMode, head: true })

  let latestQuery = supabase
    .from("ppr_sales")
    .select("date_of_sale")
    .order("date_of_sale", { ascending: false })
    .limit(1)
  let broadAreaExpression = ""

  if (resolvedFilters.area) {
    const area = resolvedFilters.area.trim()
    if (area) {
      const expressions = areaFilterExpressions(area, !resolvedFilters.county)
      broadAreaExpression = expressions.broad
    }
  }

  const propertyStyleExpression = propertyStyleFilterExpression(
    resolvedFilters.propertyStyle
  )
  countQuery = applySearchSummaryFilters(countQuery, {
    resolvedFilters,
    areaExpression: broadAreaExpression,
    minPrice,
    maxPrice,
    propertyStyleExpression,
  })
  latestQuery = applySearchSummaryFilters(latestQuery, {
    resolvedFilters,
    areaExpression: broadAreaExpression,
    minPrice,
    maxPrice,
    propertyStyleExpression,
  })

  const [countResult, latestResult] = await Promise.all([
    countQuery,
    latestQuery,
  ])
  const initialCountError = countResult.error
  const initialLatestError = latestResult.error
  let count = countResult.count
  let latest = latestResult.data

  if ((initialCountError || initialLatestError) && resolvedFilters.area) {
    const area = resolvedFilters.area.trim()
    const expressions = areaFilterExpressions(area, !resolvedFilters.county)

    if (
      expressions.fallback &&
      expressions.fallback !== expressions.broad &&
      (isStatementTimeoutError(initialCountError) || isStatementTimeoutError(initialLatestError))
    ) {
      let fallbackCountQuery = supabase
        .from("ppr_sales")
        .select("id", { count: countMode, head: true })
      let fallbackLatestQuery = supabase
        .from("ppr_sales")
        .select("date_of_sale")
        .order("date_of_sale", { ascending: false })
        .limit(1)

      fallbackCountQuery = applySearchSummaryFilters(fallbackCountQuery, {
        resolvedFilters,
        areaExpression: expressions.fallback,
        minPrice,
        maxPrice,
        propertyStyleExpression,
      })
      fallbackLatestQuery = applySearchSummaryFilters(fallbackLatestQuery, {
        resolvedFilters,
        areaExpression: expressions.fallback,
        minPrice,
        maxPrice,
        propertyStyleExpression,
      })

      const fallbackSummary = await Promise.all([fallbackCountQuery, fallbackLatestQuery])
      count = fallbackSummary[0].count
      latest = fallbackSummary[1].data
    }
  }

  if (count === null) {
    const fallbackCount = await countSearchResultsByPaging({
      resolvedFilters,
      areaExpression: broadAreaExpression,
      minPrice,
      maxPrice,
      propertyStyleExpression,
    })

    if (fallbackCount !== null) {
      count = fallbackCount
    }
  }

  return {
    count: count ?? 0,
    latestSaleDate: latest?.[0]?.date_of_sale ?? null,
  }
}

const getPprSearchSummaryCached = unstable_cache(
  async (filters: PprSearchFilters) => getPprSearchSummaryUncached(filters),
  ["ppr-search-summary"],
  { revalidate: PPR_CACHE_REVALIDATE_SECONDS }
)

export async function getPprSearchSummary(filters: PprSearchFilters): Promise<PprSearchSummary> {
  return getPprSearchSummaryCached(filters)
}

export async function getMarketSoldPrices(market: PprMarket, limit = 12) {
  let query = supabase
    .from("ppr_sales")
    .select("*", { count: "estimated" })
    .order("date_of_sale", { ascending: false })
    .limit(limit)

  if (market.marketType === "county") {
    query = query.ilike("county", market.name)
  } else if (market.marketType === "dublin_district") {
    query = query.eq("eircode_prefix", dublinDistrictPrefix(market))
  } else {
    query = query.eq("area_slug", market.areaSlug ?? market.slug)

    if (market.county) {
      query = query.ilike("county", market.county)
    }
  }

  const { data, count, error } = await query

  if (error) {
    return { sales: [] as PprSale[], count: 0, error: error.message }
  }

  return {
    sales: (data ?? []) as PprSale[],
    count: count ?? 0,
    error: "",
  }
}

export async function getAreaStats(county: string, slug: string) {
  const { data, error } = await supabase
    .from("ppr_area_stats")
    .select("*")
    .ilike("county", county)
    .eq("area_slug", slug)
    .order("period_end", { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) return null
  return data as PprAreaStats | null
}

export async function getAreaMonthly(county: string, slug: string, limit = 18) {
  const { data, error } = await supabase
    .from("ppr_area_monthly")
    .select("*")
    .ilike("county", county)
    .eq("area_slug", slug)
    .order("year_month", { ascending: false })
    .limit(limit)

  if (error || !data) return []
  return (data as PprAreaMonthly[]).reverse()
}

export async function getRecentAreaSales(county: string, slug: string, limit = 8) {
  const { data, error } = await supabase
    .from("ppr_sales")
    .select("*")
    .ilike("county", county)
    .or(broadAreaFilterExpression(slug, areaNameFromSlug(slug)))
    .order("date_of_sale", { ascending: false })
    .limit(limit)

  if (error || !data) return []
  return data as PprSale[]
}

export async function getNearbyAreaLinks(county: string, currentSlug: string, limit = 6) {
  const { data, error } = await supabase
    .from("ppr_area_stats")
    .select("county,area_slug,sales_count,median_price_eur")
    .ilike("county", county)
    .neq("area_slug", currentSlug)
    .order("sales_count", { ascending: false })
    .limit(limit)

  if (error || !data) return []
  return data as PprAreaStats[]
}

async function getCountyAreaLinksUncached(county: string, limit = 8) {
  const { data, error } = await supabase
    .from("ppr_area_stats")
    .select("county,area_slug,sales_count,median_price_eur,last_sale_date")
    .ilike("county", county)
    .not("area_slug", "is", null)
    .order("sales_count", { ascending: false })
    .limit(limit)

  if (error || !data) return []
  return data as PprAreaStats[]
}

const getCountyAreaLinksCached = unstable_cache(
  async (county: string, limit = 8) => getCountyAreaLinksUncached(county, limit),
  ["ppr-county-area-links"],
  { revalidate: PPR_CACHE_REVALIDATE_SECONDS }
)

export async function getCountyAreaLinks(county: string, limit = 8) {
  return getCountyAreaLinksCached(county, limit)
}

export async function getNearbySalesForListing({
  county,
  area,
  limit = 3,
}: {
  county?: string | null
  area?: string | null
  limit?: number
}) {
  if (!county) return []

  let query = supabase
    .from("ppr_sales")
    .select("*")
    .ilike("county", county)
    .order("date_of_sale", { ascending: false })
    .limit(limit)

  if (area) {
    const slug = areaSlug(area)
    query = query.or(broadAreaFilterExpression(slug, area))
  }

  const { data, error } = await query

  if (error || !data) return []
  return data as PprSale[]
}
