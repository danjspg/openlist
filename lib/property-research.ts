import { unstable_cache } from "next/cache"
import { wgs84ToPlanningGrid } from "@/lib/eircode-planning-grid"
import {
  planningLocationContainsLocality,
  planningLocationMatchesRoutingMarket,
} from "@/lib/eircode-fallback"
import { areaNameFromSlug, type PprSale, type PprSearchAreaOption } from "@/lib/ppr"
import {
  PLANNING_APPLICATION_SELECT,
  type PlanningApplication,
} from "@/lib/planning"
import {
  authorityCodesForCounty,
  countyForPlanningAuthority,
  distanceInKilometres,
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

export type NearbyPlanningApplication = PlanningApplication & {
  distanceKm: number
}

export type EircodePlanningFallback = {
  applications: PlanningApplication[]
  basis: "area" | "routing-key" | "locality" | "none"
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
  const areas = county ? await getPprAreaCandidatesForCounty(county) : []
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

export async function getPprAreaCandidatesForCounty(county: string) {
  return getPprAreaCandidatesForCountyCached(county)
}

export async function getPlanningApplicationsForSoldPriceArea(
  county: string,
  locality: string,
  limit = 5
) {
  return getPlanningApplicationsForSoldPriceAreaCached(county, locality, limit)
}

export async function getRecentPlanningApplicationsForCounty(county: string, limit = 6) {
  const authorityCodes = authorityCodesForCounty(county)
  if (authorityCodes.length === 0) return [] as PlanningApplication[]

  const { data } = await getServerSupabase()
    .from("planning_applications")
    .select(PLANNING_APPLICATION_SELECT)
    .in("local_authority_code", authorityCodes)
    .order("registration_date", { ascending: false })
    .order("reference", { ascending: false })
    .limit(limit)

  return (data ?? []) as PlanningApplication[]
}

export async function findNearbyPlanningApplications(
  origin: { lat: number; lng: number },
  options: { radiusKm?: number; limit?: number; excludeIds?: string[] } = {}
) {
  const radiusKm = Math.min(Math.max(options.radiusKm ?? 2, 0.2), 5)
  const limit = Math.min(Math.max(options.limit ?? 12, 1), 20)
  const gridOrigin = wgs84ToPlanningGrid(origin)
  if (!gridOrigin) return [] as NearbyPlanningApplication[]

  const radiusMetres = radiusKm * 1_000
  const { data } = await getServerSupabase()
    .from("planning_applications")
    .select(PLANNING_APPLICATION_SELECT)
    .gte("grid_easting", gridOrigin.easting - radiusMetres)
    .lte("grid_easting", gridOrigin.easting + radiusMetres)
    .gte("grid_northing", gridOrigin.northing - radiusMetres)
    .lte("grid_northing", gridOrigin.northing + radiusMetres)
    .order("registration_date", { ascending: false })
    .order("reference", { ascending: false })
    .limit(100)

  const excludedIds = new Set(options.excludeIds ?? [])
  return ((data ?? []) as PlanningApplication[])
    .flatMap((application) => {
      if (excludedIds.has(application.id)) return []
      const coordinates = planningGridToWgs84(application)
      if (!coordinates) return []
      const distanceKm = distanceInKilometres(origin, coordinates)
      return distanceKm <= radiusKm ? [{ ...application, distanceKm }] : []
    })
    .sort(
      (a, b) =>
        a.distanceKm - b.distanceKm ||
        String(b.registration_date ?? "").localeCompare(String(a.registration_date ?? ""))
    )
    .slice(0, limit)
}

export async function findEircodePlanningFallback({
  routingKey,
  county,
  locality,
  areaSlug = null,
  routingAreas = [],
  excludeIds = [],
  limit = 6,
}: {
  routingKey: string
  county: string
  locality: string | null
  areaSlug?: string | null
  routingAreas?: Array<Pick<PprSale, "locality" | "area_slug">>
  excludeIds?: string[]
  limit?: number
}): Promise<EircodePlanningFallback> {
  const resultLimit = Math.min(Math.max(limit, 1), 12)
  const candidateLimit = Math.min(resultLimit + Math.min(excludeIds.length, 25), 37)
  const excluded = new Set(excludeIds)

  // A verified market/area is narrower than a Routing Key. Query a bounded
  // locality candidate set, then require OpenList's national area matcher to
  // resolve every result back to that same area. If no result survives, do not
  // widen back out to the Routing Key: that would mix neighbouring towns.
  if (areaSlug && locality) {
    const authorityCodes = authorityCodesForCounty(county)
    if (authorityCodes.length === 0) {
      return { applications: [], basis: "none" }
    }
    const [knownAreas, areaResult] = await Promise.all([
      getPprAreaCandidatesForCounty(county),
      getServerSupabase()
        .from("planning_applications")
        .select(PLANNING_APPLICATION_SELECT)
        .in("local_authority_code", authorityCodes)
        .ilike("location", `%${escapePostgrestLike(locality)}%`)
        .order("registration_date", { ascending: false })
        .order("reference", { ascending: false })
        .limit(Math.min(Math.max(resultLimit * 10, 40), 100)),
    ])
    const areaApplications = ((areaResult.data ?? []) as PlanningApplication[])
      .filter((application) => {
        if (excluded.has(application.id)) return false
        if (!planningLocationMatchesRoutingMarket(
          application.location,
          locality,
          areaSlug,
          routingAreas
        )) return false
        const match = matchPlanningLocation(application, knownAreas)
        return match.areaSlug === areaSlug
      })
      .slice(0, resultLimit)

    return {
      applications: areaApplications,
      basis: areaApplications.length > 0 ? "area" : "none",
    }
  }

  const supabase = getServerSupabase()
  const { data: routingData, error: routingError } = await supabase
    .from("planning_applications")
    .select(PLANNING_APPLICATION_SELECT)
    .eq("eircode_prefix", routingKey)
    .order("registration_date", { ascending: false })
    .order("reference", { ascending: false })
    .limit(candidateLimit)
  const missingRoutingColumn = Boolean(
    routingError &&
      (routingError.code === "42703" ||
        routingError.message?.includes("eircode_prefix"))
  )
  const legacyRoutingResult = missingRoutingColumn
    ? await supabase
        .from("planning_applications")
        .select(PLANNING_APPLICATION_SELECT)
        .like("eircode", `${routingKey} %`)
        .order("registration_date", { ascending: false })
        .order("reference", { ascending: false })
        .limit(candidateLimit)
    : null
  if (routingError && !missingRoutingColumn) {
    return { applications: [], basis: "none" }
  }
  const routingApplications = ((routingData ?? []) as PlanningApplication[])
    .concat((legacyRoutingResult?.data ?? []) as PlanningApplication[])
    .filter((application) => !excluded.has(application.id))
    .slice(0, resultLimit)

  if (routingApplications.length > 0) {
    return { applications: routingApplications, basis: "routing-key" }
  }

  if (!locality) return { applications: [], basis: "none" }
  const authorityCodes = authorityCodesForCounty(county)
  if (authorityCodes.length === 0) {
    return { applications: [], basis: "none" }
  }

  // The trigram index bounds this fallback query. A small candidate set is
  // then checked for whole locality tokens so Dublin 6 cannot match Dublin 60,
  // and a generic county/city name is never used by this path.
  const localityCandidateLimit = Math.min(Math.max(resultLimit * 6, 24), 60)
  const { data: localityData } = await getServerSupabase()
    .from("planning_applications")
    .select(PLANNING_APPLICATION_SELECT)
    .in("local_authority_code", authorityCodes)
    .ilike("location", `%${escapePostgrestLike(locality)}%`)
    .order("registration_date", { ascending: false })
    .order("reference", { ascending: false })
    .limit(localityCandidateLimit)
  const localityApplications = ((localityData ?? []) as PlanningApplication[])
    .filter(
      (application) =>
        !excluded.has(application.id) &&
        planningLocationContainsLocality(application.location, locality)
    )
    .slice(0, resultLimit)

  return {
    applications: localityApplications,
    basis: localityApplications.length > 0 ? "locality" : "none",
  }
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
