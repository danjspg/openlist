import {
  rankNearbyPprSales,
  resolveEircodeLocationContext,
  type EircodeLocationContext,
  type NearbyPprSale,
} from "@/lib/eircode-location"
import { getEircodeFallbackPlan } from "@/lib/eircode-fallback"
import {
  PLANNING_APPLICATION_SELECT,
  type PlanningApplication,
} from "@/lib/planning"
import {
  getAreaStats,
  type PprAreaStats,
  type PprSale,
} from "@/lib/ppr"
import { countyForPlanningAuthority } from "@/lib/property-intelligence"
import {
  findNearbyPlanningApplications,
  findEircodePlanningFallback,
  getPprAreaCandidatesForCounty,
  type NearbyPlanningApplication,
} from "@/lib/property-research"
import { getServerSupabase } from "@/lib/supabase"

export const EIRCODE_NEARBY_RADIUS_KM = 2
const EXACT_RESULT_LIMIT = 25
const NEARBY_RESULT_LIMIT = 12
const ROUTING_SAMPLE_LIMIT = 100

const EIRCODE_PPR_SELECT =
  "id,date_of_sale,address_raw,address_normalised,locality,county,eircode,eircode_prefix,price_eur,property_description_raw,is_new_dwelling,vat_exclusive,source_url,area_slug,lat,lng"

export type { NearbyPprSale } from "@/lib/eircode-location"

export type EircodeLocalMarket = {
  level: "area" | "routing-area" | "county"
  county: string
  locality: string | null
  areaSlug: string | null
  stats: PprAreaStats | null
  recentSales: PprSale[]
  planningApplications: PlanningApplication[]
  label: string
  routingKey: string
  salesBasis: "area" | "routing-key"
  planningBasis: "area" | "routing-key" | "locality" | "none"
}

export type EircodeIntelligenceResults = {
  exactSales: PprSale[]
  exactPlanningApplications: PlanningApplication[]
  locationContext: EircodeLocationContext
  nearbySales: NearbyPprSale[]
  nearbyPlanningApplications: NearbyPlanningApplication[]
  localMarket: EircodeLocalMarket | null
}

export async function getEircodeIntelligence(
  eircode: string
): Promise<EircodeIntelligenceResults> {
  const supabase = getServerSupabase()
  const [pprResult, planningResult] = await withDeadline(Promise.all([
    supabase
      .from("ppr_sales")
      .select(EIRCODE_PPR_SELECT)
      .eq("eircode", eircode)
      .order("date_of_sale", { ascending: false })
      .limit(EXACT_RESULT_LIMIT),
    supabase
      .from("planning_applications")
      .select(PLANNING_APPLICATION_SELECT)
      .eq("eircode", eircode)
      .order("registration_date", { ascending: false })
      .order("reference", { ascending: false })
      .limit(EXACT_RESULT_LIMIT),
  ]), 8_000)
  if (pprResult.error || planningResult.error) {
    throw new Error("Eircode exact source lookup failed")
  }
  const exactSales = (pprResult.data ?? []) as PprSale[]
  const exactPlanningApplications = (planningResult.data ?? []) as PlanningApplication[]

  const needsPlanningAreaResolution =
    exactSales.every((sale) => !sale.area_slug) && exactPlanningApplications.length > 0
  const planningCounties = needsPlanningAreaResolution
    ? [
        ...new Set(
          exactPlanningApplications
            .map((application) => countyForPlanningAuthority(application.local_authority_code))
            .filter((county): county is string => Boolean(county))
        ),
      ]
    : []
  const hasExactRecords = exactSales.length > 0 || exactPlanningApplications.length > 0
  const [knownAreaGroups, routingKeySales] = await Promise.all([
    Promise.all(planningCounties.map((county) => getPprAreaCandidatesForCounty(county))),
    hasExactRecords
      ? Promise.resolve([] as Array<Pick<PprSale, "county" | "locality" | "area_slug">>)
      : findRoutingKeySales(eircode.slice(0, 3)),
  ])
  const locationContext = resolveEircodeLocationContext({
    eircode,
    pprSales: exactSales,
    planningApplications: exactPlanningApplications,
    knownAreas: knownAreaGroups.flat(),
    routingKeySales,
  })
  const coordinates =
    locationContext.lat !== null && locationContext.lng !== null
      ? { lat: locationContext.lat, lng: locationContext.lng }
      : null

  const [nearbySales, nearbyPlanningApplications, localMarket] = await Promise.all([
    // PPR ingestion does not currently populate coordinates. Keep the bounded
    // lookup ready for a directly geocoded PPR origin without making every
    // planning-coordinate search scan the sparse PPR coordinate columns.
    coordinates
      ? findNearbyPprSales(coordinates, exactSales.map((sale) => sale.id))
      : Promise.resolve([] as NearbyPprSale[]),
    coordinates
      ? findNearbyPlanningApplications(coordinates, {
          radiusKm: EIRCODE_NEARBY_RADIUS_KM,
          limit: NEARBY_RESULT_LIMIT,
          excludeIds: exactPlanningApplications.map((application) => application.id),
        })
      : Promise.resolve([] as NearbyPlanningApplication[]),
    loadLocalMarket(
      locationContext,
      exactSales.map((sale) => sale.id),
      exactPlanningApplications.map((application) => application.id),
      routingKeySales
    ),
  ])

  return {
    exactSales,
    exactPlanningApplications,
    locationContext,
    nearbySales,
    nearbyPlanningApplications,
    localMarket,
  }
}

async function findRoutingKeySales(routingKey: string) {
  const { data } = await getServerSupabase()
    .from("ppr_sales")
    .select("county,locality,area_slug")
    .eq("eircode_prefix", routingKey)
    .order("date_of_sale", { ascending: false })
    .limit(ROUTING_SAMPLE_LIMIT)

  return (data ?? []) as Array<Pick<PprSale, "county" | "locality" | "area_slug">>
}

async function loadLocalMarket(
  location: EircodeLocationContext,
  exactSaleIds: string[],
  exactPlanningIds: string[],
  routingKeySales: Array<Pick<PprSale, "county" | "locality" | "area_slug">>
): Promise<EircodeLocalMarket | null> {
  // A routing key can legitimately span several towns and even counties. In
  // that case the UI presents explicit market choices; selecting one detailed
  // market or falling back to county-wide records would be misleading.
  if (location.source === "routing-key" && location.routingMarkets.length > 1) {
    return null
  }
  const fallback = getEircodeFallbackPlan(location)
  if (!location.county || !fallback) return null

  if (location.areaSlug) {
    const [stats, recentSales, planningFallback] = await Promise.all([
      fallback.statsScope
        ? getAreaStats(fallback.statsScope.county, fallback.statsScope.areaSlug)
        : Promise.resolve(null),
      fallback.salesScope.kind === "routing-key"
        ? findRecentRoutingKeySales(fallback.routingKey, exactSaleIds, 8)
        : findRecentLocalMarketSales(
            fallback.salesScope.county,
            fallback.salesScope.areaSlug,
            exactSaleIds,
            8
          ),
      findEircodePlanningFallback({
        routingKey: fallback.routingKey,
        county: location.county,
        locality: fallback.planningLocalityFallback,
        areaSlug:
          fallback.salesScope.kind === "area"
            ? fallback.salesScope.areaSlug
            : null,
        routingAreas: routingKeySales,
        excludeIds: exactPlanningIds,
        limit: 6,
      }),
    ])
    return {
      level: location.source === "routing-key" ? "routing-area" : "area",
      county: location.county,
      locality: location.locality,
      areaSlug: location.areaSlug,
      stats,
      recentSales,
      planningApplications: planningFallback.applications,
      label: fallback.label,
      routingKey: fallback.routingKey,
      salesBasis: fallback.salesScope.kind,
      planningBasis: planningFallback.basis,
    }
  }

  const [recentSales, planningFallback] = await Promise.all([
    findRecentRoutingKeySales(fallback.routingKey, exactSaleIds, 8),
    findEircodePlanningFallback({
      routingKey: fallback.routingKey,
      county: location.county,
      locality: fallback.planningLocalityFallback,
      areaSlug: null,
      routingAreas: routingKeySales,
      excludeIds: exactPlanningIds,
      limit: 6,
    }),
  ])
  return {
    level: location.source === "routing-key" ? "routing-area" : "county",
    county: location.county,
    locality: null,
    areaSlug: null,
    stats: null,
    recentSales,
    planningApplications: planningFallback.applications,
    label: fallback.label,
    routingKey: fallback.routingKey,
    salesBasis: "routing-key",
    planningBasis: planningFallback.basis,
  }
}

async function findRecentLocalMarketSales(
  county: string,
  areaSlug: string,
  excludeIds: string[],
  limit: number
) {
  const { data, error } = await getServerSupabase()
    .from("ppr_sales")
    .select(EIRCODE_PPR_SELECT)
    .eq("county", county)
    .eq("area_slug", areaSlug)
    .order("date_of_sale", { ascending: false })
    .limit(boundedCandidateLimit(limit, excludeIds.length))

  if (error || !data) return [] as PprSale[]
  const excluded = new Set(excludeIds)
  return (data as PprSale[])
    .filter((sale) => !excluded.has(sale.id))
    .slice(0, boundedResultLimit(limit))
}

async function findRecentRoutingKeySales(
  routingKey: string,
  excludeIds: string[],
  limit: number
) {
  const { data, error } = await getServerSupabase()
    .from("ppr_sales")
    .select(EIRCODE_PPR_SELECT)
    .eq("eircode_prefix", routingKey)
    .order("date_of_sale", { ascending: false })
    .limit(boundedCandidateLimit(limit, excludeIds.length))

  if (error || !data) return [] as PprSale[]
  const excluded = new Set(excludeIds)
  return (data as PprSale[])
    .filter((sale) => !excluded.has(sale.id))
    .slice(0, boundedResultLimit(limit))
}

function boundedResultLimit(limit: number) {
  return Math.min(Math.max(limit, 1), 12)
}

function boundedCandidateLimit(limit: number, excludedCount: number) {
  return Math.min(boundedResultLimit(limit) + Math.min(excludedCount, 25), 37)
}

async function findNearbyPprSales(
  origin: { lat: number; lng: number },
  excludeIds: string[]
) {
  const latitudeDelta = EIRCODE_NEARBY_RADIUS_KM / 111.32
  const longitudeDelta =
    EIRCODE_NEARBY_RADIUS_KM /
    (111.32 * Math.max(Math.cos((origin.lat * Math.PI) / 180), 0.2))
  const { data } = await getServerSupabase()
    .from("ppr_sales")
    .select(EIRCODE_PPR_SELECT)
    .gte("lat", origin.lat - latitudeDelta)
    .lte("lat", origin.lat + latitudeDelta)
    .gte("lng", origin.lng - longitudeDelta)
    .lte("lng", origin.lng + longitudeDelta)
    .order("date_of_sale", { ascending: false })
    .limit(100)
  const excluded = new Set(excludeIds)
  return rankNearbyPprSales(
    (data ?? []) as PprSale[],
    origin,
    excluded,
    EIRCODE_NEARBY_RADIUS_KM,
    NEARBY_RESULT_LIMIT
  )
}

function withDeadline<T>(promise: Promise<T>, milliseconds: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error("Eircode source lookup deadline exceeded")),
      milliseconds
    )
    promise.then(
      (value) => {
        clearTimeout(timeout)
        resolve(value)
      },
      (error) => {
        clearTimeout(timeout)
        reject(error)
      }
    )
  })
}
