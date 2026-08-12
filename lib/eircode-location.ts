import type { PlanningApplication } from "@/lib/planning"
import type { PprSale, PprSearchAreaOption } from "@/lib/ppr"
import {
  getEircodeRoutingMarkets,
  type EircodeRoutingMarket,
} from "@/lib/eircode-routing-markets"
import {
  countyForPlanningAuthority,
  distanceInKilometres,
  matchPlanningLocation,
  planningGridToWgs84,
} from "@/lib/property-intelligence"

export type EircodeLocationSource =
  | "ppr-exact"
  | "planning-exact"
  | "routing-key"
  | "none"

export type EircodeLocationConfidence = "high" | "medium" | "low" | "none"

export type EircodeLocationContext = {
  eircode: string
  county: string | null
  locality: string | null
  areaSlug: string | null
  lat: number | null
  lng: number | null
  source: EircodeLocationSource
  coordinateSource: "ppr-exact" | "planning-exact" | null
  confidence: EircodeLocationConfidence
  contextLevel: "exact-record" | "routing-area" | "unresolved"
  conflict: string | null
  routingMarkets: EircodeRoutingMarket[]
}

export type NearbyPprSale = PprSale & {
  distanceKm: number
}

type ResolveEircodeLocationInput = {
  eircode: string
  pprSales: PprSale[]
  planningApplications: PlanningApplication[]
  knownAreas?: PprSearchAreaOption[]
  routingKeySales?: Array<Pick<PprSale, "county" | "locality" | "area_slug">>
}

export function resolveEircodeLocationContext({
  eircode,
  pprSales,
  planningApplications,
  knownAreas = [],
  routingKeySales = [],
}: ResolveEircodeLocationInput): EircodeLocationContext {
  const recentPprSales = [...pprSales].sort((a, b) =>
    b.date_of_sale.localeCompare(a.date_of_sale)
  )
  const recentPlanning = [...planningApplications].sort((a, b) =>
    String(b.registration_date ?? "").localeCompare(String(a.registration_date ?? ""))
  )
  const pprRecord = recentPprSales.find(hasDefensiblePprContext) ?? recentPprSales[0] ?? null
  const planningRecord = recentPlanning[0] ?? null
  const planningLocation = planningRecord
    ? matchPlanningLocation(planningRecord, knownAreas)
    : null
  const pprCoordinates = recentPprSales.map(pprCoordinatesFromSale).find(Boolean) ?? null
  const planningCoordinates = recentPlanning.map(planningGridToWgs84).find(Boolean) ?? null
  const pprCounty = clean(pprRecord?.county)
  const planningCounty =
    clean(planningLocation?.county) ??
    clean(countyForPlanningAuthority(planningRecord?.local_authority_code))
  const countiesConflict = Boolean(
    pprCounty && planningCounty && normalise(pprCounty) !== normalise(planningCounty)
  )

  if (pprRecord) {
    const coordinates =
      pprCoordinates ?? (!countiesConflict ? planningCoordinates : null)
    const pprValuesConflict =
      hasConflictingValues(recentPprSales, "county") ||
      hasConflictingValues(recentPprSales, "area_slug") ||
      hasConflictingValues(recentPprSales, "locality")

    return {
      eircode,
      county: pprCounty,
      locality: clean(pprRecord.locality),
      areaSlug: clean(pprRecord.area_slug),
      lat: coordinates?.lat ?? null,
      lng: coordinates?.lng ?? null,
      source: "ppr-exact",
      coordinateSource: pprCoordinates
        ? "ppr-exact"
        : planningCoordinates && !countiesConflict
          ? "planning-exact"
          : null,
      confidence: countiesConflict || pprValuesConflict ? "medium" : "high",
      contextLevel: "exact-record",
      conflict: countiesConflict
        ? "Exact PPR and planning records disagree on county; OpenList retained the PPR area and did not use the planning coordinates."
        : pprValuesConflict
          ? "Historic PPR records contain differing location values; OpenList used the most recent defensible record."
          : null,
      routingMarkets: [],
    }
  }

  if (planningRecord) {
    return {
      eircode,
      county: planningCounty,
      locality: clean(planningLocation?.locality),
      areaSlug: clean(planningLocation?.areaSlug),
      lat: planningCoordinates?.lat ?? null,
      lng: planningCoordinates?.lng ?? null,
      source: "planning-exact",
      coordinateSource: planningCoordinates ? "planning-exact" : null,
      confidence: planningLocation?.areaSlug || planningCoordinates ? "high" : "medium",
      contextLevel: "exact-record",
      conflict: null,
      routingMarkets: [],
    }
  }

  const routingContext = resolveRoutingArea(eircode.slice(0, 3), routingKeySales)
  if (routingContext) {
    return {
      eircode,
      county: routingContext.county,
      locality: routingContext.locality,
      areaSlug: routingContext.areaSlug,
      lat: null,
      lng: null,
      source: "routing-key",
      coordinateSource: null,
      confidence: "low",
      contextLevel: "routing-area",
      conflict: null,
      routingMarkets: routingContext.routingMarkets,
    }
  }

  return {
    eircode,
    county: null,
    locality: null,
    areaSlug: null,
    lat: null,
    lng: null,
    source: "none",
    coordinateSource: null,
    confidence: "none",
    contextLevel: "unresolved",
    conflict: null,
    routingMarkets: [],
  }
}

function resolveRoutingArea(
  routingKey: string,
  sales: Array<Pick<PprSale, "county" | "locality" | "area_slug">>
) {
  if (sales.length < 5) return null
  const populatedCounties = sales
    .map((sale) => clean(sale.county))
    .filter((county): county is string => Boolean(county))
  if (populatedCounties.length === 0) return null

  const curatedMarkets = getEircodeRoutingMarkets(routingKey)
  if (curatedMarkets.length > 0) {
    const curatedCounties = new Set(
      curatedMarkets.map((market) => normalise(market.county))
    )
    const corroboratingSales = populatedCounties.filter((county) =>
      curatedCounties.has(normalise(county))
    ).length
    const conflictingShare = 1 - corroboratingSales / populatedCounties.length

    if (corroboratingSales >= 5 && conflictingShare <= 0.2) {
      const marketCounties = [...new Set(curatedMarkets.map((market) => market.county))]
      const singleMarket = curatedMarkets.length === 1 ? curatedMarkets[0] : null
      return {
        county: singleMarket?.county ?? (marketCounties.length === 1 ? marketCounties[0] : null),
        locality: singleMarket?.locality ?? null,
        areaSlug: singleMarket?.areaSlug ?? null,
        routingMarkets: curatedMarkets,
      }
    }
  }

  const county = dominantValue(populatedCounties, 0.6)
  if (!county) return null

  const countySales = sales.filter(
    (sale) => normalise(clean(sale.county)) === normalise(county)
  )
  const areaSlug = dominantValue(countySales.map((sale) => clean(sale.area_slug)), 0.7)
  const locality = areaSlug
    ? dominantValue(
        countySales
          .filter((sale) => clean(sale.area_slug) === areaSlug)
          .map((sale) => clean(sale.locality)),
        0.5
      )
    : null

  return {
    county,
    areaSlug,
    locality,
    routingMarkets: areaSlug
      ? [{ county, areaSlug, locality: locality ?? areaSlug, label: locality ?? areaSlug }]
      : [],
  }
}

function dominantValue(values: Array<string | null>, minimumShare: number) {
  const populated = values.filter((value): value is string => Boolean(value))
  if (populated.length === 0) return null
  const counts = new Map<string, { value: string; count: number }>()
  for (const value of populated) {
    const key = normalise(value)
    const current = counts.get(key)
    counts.set(key, { value: current?.value ?? value, count: (current?.count ?? 0) + 1 })
  }
  const winner = [...counts.values()].sort((a, b) => b.count - a.count)[0]
  return winner.count / populated.length >= minimumShare ? winner.value : null
}

function hasDefensiblePprContext(sale: PprSale) {
  return Boolean(clean(sale.county) || clean(sale.locality) || clean(sale.area_slug))
}

function pprCoordinatesFromSale(sale: PprSale) {
  const lat = nullableNumber(sale.lat)
  const lng = nullableNumber(sale.lng)
  if (lat === null || lng === null || lat < 51 || lat > 56 || lng < -11 || lng > -5) {
    return null
  }
  return { lat, lng }
}

function hasConflictingValues(sales: PprSale[], key: "county" | "area_slug" | "locality") {
  const values = new Set(sales.map((sale) => normalise(clean(sale[key]))).filter(Boolean))
  return values.size > 1
}

function nullableNumber(value: number | string | null | undefined) {
  if (value === null || value === undefined || value === "") return null
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

function clean(value: string | null | undefined) {
  const cleaned = String(value ?? "").trim()
  return cleaned || null
}

function normalise(value: string | null | undefined) {
  return String(value ?? "").trim().toLowerCase()
}

export function rankNearbyPprSales(
  sales: PprSale[],
  origin: { lat: number; lng: number },
  excludedIds: ReadonlySet<string> = new Set(),
  radiusKm = 2,
  limit = 12
) {
  return sales
    .flatMap((sale) => {
      if (excludedIds.has(sale.id) || sale.lat === null || sale.lng === null) return []
      const target = { lat: Number(sale.lat), lng: Number(sale.lng) }
      if (!Number.isFinite(target.lat) || !Number.isFinite(target.lng)) return []
      const distanceKm = distanceInKilometres(origin, target)
      return distanceKm <= radiusKm ? [{ ...sale, distanceKm }] : []
    })
    .sort(
      (a, b) =>
        a.distanceKm - b.distanceKm || b.date_of_sale.localeCompare(a.date_of_sale)
    )
    .slice(0, Math.max(0, limit)) as NearbyPprSale[]
}
