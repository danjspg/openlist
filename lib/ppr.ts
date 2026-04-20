import { supabase } from "@/lib/supabase"

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
  page?: string
}

export const PPR_PAGE_SIZE = 12

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

function numericFilter(value?: string) {
  if (!value) return null
  const parsed = Number(value.replace(/[^0-9.]/g, ""))
  return Number.isFinite(parsed) ? parsed : null
}

function safePage(value?: string) {
  const page = Number(value)
  return Number.isInteger(page) && page > 0 ? page : 1
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
    .select("id", { count: "exact", head: true })

  const { data: latest } = await supabase
    .from("ppr_sales")
    .select("date_of_sale,price_eur")
    .order("date_of_sale", { ascending: false })
    .limit(1)
    .maybeSingle()

  const { data: counties } = await supabase
    .from("ppr_sales")
    .select("county")
    .not("county", "is", null)
    .limit(5000)

  return {
    salesCount: count ?? 0,
    latestSaleDate: latest?.date_of_sale ?? null,
    latestSalePrice: latest?.price_eur ?? null,
    countyCount: new Set((counties ?? []).map((row) => row.county)).size,
  }
}

export async function searchPprSales(filters: PprSearchFilters) {
  const page = safePage(filters.page)
  const from = (page - 1) * PPR_PAGE_SIZE
  const to = from + PPR_PAGE_SIZE - 1
  const minPrice = numericFilter(filters.minPrice)
  const maxPrice = numericFilter(filters.maxPrice)

  let query = supabase
    .from("ppr_sales")
    .select("*", { count: "exact" })
    .order("date_of_sale", { ascending: false })
    .range(from, to)

  if (filters.county) {
    query = query.ilike("county", filters.county)
  }

  if (filters.area) {
    const area = filters.area.trim()
    if (area) {
      query = query.or(
        `locality.ilike.%${area}%,address_raw.ilike.%${area}%,area_slug.eq.${areaSlug(area)}`
      )
    }
  }

  if (minPrice !== null) query = query.gte("price_eur", minPrice)
  if (maxPrice !== null) query = query.lte("price_eur", maxPrice)
  if (filters.dateFrom) query = query.gte("date_of_sale", filters.dateFrom)
  if (filters.dateTo) query = query.lte("date_of_sale", filters.dateTo)

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
    .order("year_month", { ascending: true })
    .limit(limit)

  if (error || !data) return []
  return data as PprAreaMonthly[]
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
