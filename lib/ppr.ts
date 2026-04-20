import { supabase } from "@/lib/supabase"
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

export const PPR_PAGE_SIZE = 12

export function formatPprDateInput(date: Date) {
  return date.toISOString().slice(0, 10)
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
  if (filters.dateFrom || filters.dateTo || filters.dateRange === "all") {
    return {
      ...filters,
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

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "—"

  return new Intl.DateTimeFormat("en-IE", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date)
}

export function compactAddress(address: string) {
  return address
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .join(", ")
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

  return filters.join(",")
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

export async function getPprQuickAreas(limit = 8) {
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

export async function getPprKpis() {
  const { count } = await supabase
    .from("ppr_sales")
    .select("id", { count: "estimated", head: true })

  const { data: latest } = await supabase
    .from("ppr_sales")
    .select("date_of_sale,price_eur")
    .order("date_of_sale", { ascending: false })
    .limit(1)
    .maybeSingle()

  return {
    salesCount: count ?? 0,
    latestSaleDate: latest?.date_of_sale ?? null,
    latestSalePrice: latest?.price_eur ?? null,
    countyCount: 26,
  }
}

export async function searchPprSales(filters: PprSearchFilters) {
  const resolvedFilters = withDefaultPprSearchFilters(filters)
  const page = safePage(resolvedFilters.page)
  const from = (page - 1) * PPR_PAGE_SIZE
  const to = from + PPR_PAGE_SIZE - 1
  const minPrice = numericFilter(resolvedFilters.minPrice)
  const maxPrice = numericFilter(resolvedFilters.maxPrice)
  const sort = sortOption(resolvedFilters.sort)

  let query = supabase
    .from("ppr_sales")
    .select("*", { count: "estimated" })
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

  if (resolvedFilters.county) {
    query = query.ilike("county", resolvedFilters.county)
  }

  if (resolvedFilters.area) {
    const area = resolvedFilters.area.trim()
    if (area) {
      const expression = areaFilterExpression(area, !resolvedFilters.county)
      if (expression) query = query.or(expression)
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

  const { data, count, error } = await query

  if (error) {
    return { sales: [] as PprSale[], count: 0, page, error: error.message }
  }

  return {
    sales: (data ?? []) as PprSale[],
    count: count ?? 0,
    page,
    error: "",
  }
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
    query = query.eq("area_slug", market.slug)
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
    .eq("area_slug", slug)
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
    query = query.eq("area_slug", areaSlug(area))
  }

  const { data, error } = await query

  if (error || !data) return []
  return data as PprSale[]
}
