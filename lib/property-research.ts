import { unstable_cache } from "next/cache"
import { areaNameFromSlug, type PprSale, type PprSearchAreaOption } from "@/lib/ppr"
import {
  PLANNING_APPLICATION_SELECT,
  type PlanningApplication,
} from "@/lib/planning"
import {
  authorityCodesForCounty,
  countyForPlanningAuthority,
  matchPlanningLocation,
  planningGridToWgs84,
  type LocationIntelligenceContext,
} from "@/lib/property-intelligence"
import { getServerSupabase } from "@/lib/supabase"

export type NearbySoldPrice = PprSale & {
  distanceKm: number | null
  matchKind: "proximity" | "eircode" | "locality"
}

export type PlanningResearchContext = {
  location: LocationIntelligenceContext
  coordinates: { lat: number; lng: number } | null
  nearbySales: NearbySoldPrice[]
}

const NEARBY_SALE_SELECT =
  "id,date_of_sale,address_raw,address_normalised,locality,county,eircode,eircode_prefix,price_eur,property_description_raw,is_new_dwelling,vat_exclusive,source_url,area_slug,lat,lng"

const PLANNING_RESEARCH_REVALIDATE_SECONDS = 60 * 60 * 6
const PPR_AREA_CANDIDATE_REVALIDATE_SECONDS = 60 * 60 * 24
const PLANNING_RESEARCH_CACHE_VERSION = "v2"

export async function getPlanningResearchContext(
  application: PlanningApplication
): Promise<PlanningResearchContext> {
  return getPlanningResearchContextCached(application)
}

const getPlanningResearchContextCached = unstable_cache(
  async function getPlanningResearchContextUncached(
    application: PlanningApplication
  ): Promise<PlanningResearchContext> {
  const county = countyForPlanningAuthority(application.local_authority_code)
  const areas = county ? await getPprAreaCandidatesForCountyCached(county) : []
  const location = matchPlanningLocation(application, areas)
  const coordinates = planningGridToWgs84(application)
  const nearbySales = await findNearbySales(location)

  return { location, coordinates, nearbySales }
  },
  ["planning-research-context", PLANNING_RESEARCH_CACHE_VERSION],
  { revalidate: PLANNING_RESEARCH_REVALIDATE_SECONDS }
)

async function findNearbySales(
  location: LocationIntelligenceContext
) {
  const supabase = getServerSupabase()

  if (location.eircode) {
    const { data } = await supabase
      .from("ppr_sales")
      .select(NEARBY_SALE_SELECT)
      .eq("eircode", location.eircode)
      .order("date_of_sale", { ascending: false })
      .limit(6)

    if (data?.length) {
      return (data as PprSale[]).map((sale) => ({
        ...sale,
        distanceKm: null,
        matchKind: "eircode" as const,
      }))
    }
  }

  if (location.county && location.areaSlug) {
    const { data } = await supabase
      .from("ppr_sales")
      .select(NEARBY_SALE_SELECT)
      .eq("county", location.county)
      .eq("area_slug", location.areaSlug)
      .order("date_of_sale", { ascending: false })
      .limit(6)

    return ((data ?? []) as PprSale[]).map((sale) => ({
      ...sale,
      distanceKm: null,
      matchKind: "locality" as const,
    }))
  }

  return [] as NearbySoldPrice[]
}

const getPprAreaCandidatesForCountyCached = unstable_cache(async function getPprAreaCandidatesForCounty(county: string) {
  const { data } = await getServerSupabase()
    .from("ppr_area_stats")
    .select("county,area_slug,sales_count,last_sale_date")
    .eq("county", county)
    .eq("geography_type", "area")
    .order("sales_count", { ascending: false })
    .limit(800)

  return (data ?? []).flatMap((row) => {
    if (!row.county || !row.area_slug) return []
    return [{
      county: row.county,
      areaSlug: row.area_slug,
      areaLabel: areaNameFromSlug(row.area_slug),
      salesCount: Number(row.sales_count ?? 0),
      lastSaleDate: row.last_sale_date ?? null,
    } satisfies PprSearchAreaOption]
  })
}, ["planning-ppr-area-candidates", PLANNING_RESEARCH_CACHE_VERSION], {
  revalidate: PPR_AREA_CANDIDATE_REVALIDATE_SECONDS,
})

export async function getPlanningApplicationsForSoldPriceArea(
  county: string,
  locality: string,
  limit = 5
) {
  return getPlanningApplicationsForSoldPriceAreaCached(county, locality, limit)
}

const getPlanningApplicationsForSoldPriceAreaCached = unstable_cache(async function getPlanningApplicationsForSoldPriceAreaUncached(
  county: string,
  locality: string,
  limit: number
) {
  const authorityCodes = authorityCodesForCounty(county)
  if (authorityCodes.length === 0 || locality.trim().length < 2) {
    return [] as PlanningApplication[]
  }

  const { data } = await getServerSupabase()
    .from("planning_applications")
    .select(PLANNING_APPLICATION_SELECT)
    .in("local_authority_code", authorityCodes)
    .ilike("location", `%${escapePostgrestLike(locality)}%`)
    .order("registration_date", { ascending: false })
    .order("reference", { ascending: false })
    .limit(limit)

  return (data ?? []) as PlanningApplication[]
}, ["planning-applications-for-sold-price-area", PLANNING_RESEARCH_CACHE_VERSION], {
  revalidate: PLANNING_RESEARCH_REVALIDATE_SECONDS,
})

function escapePostgrestLike(value: string) {
  return value.replace(/[,%]/g, " ").replace(/\s+/g, " ").trim()
}
