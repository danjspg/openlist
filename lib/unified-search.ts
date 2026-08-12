import { unstable_cache } from "next/cache"
import { getPprAreaSuggestions, type PprSale } from "@/lib/ppr"
import {
  searchExactEircode,
  type ExactEircodeSearchDependencies,
} from "@/lib/exact-eircode-search"
import {
  getEircodeIntelligence,
  type EircodeLocalMarket,
  type NearbyPprSale,
} from "@/lib/eircode-intelligence"
import type { EircodeLocationContext } from "@/lib/eircode-location"
import {
  PLANNING_APPLICATION_SELECT,
  type PlanningApplication,
} from "@/lib/planning"
import type { NearbyPlanningApplication } from "@/lib/property-research"
import { normaliseEircode } from "@/lib/eircode.mjs"
import {
  classifyUnifiedSearchIntent,
  rankAddressResults,
  rankPlaceSuggestions,
  selectUniqueExactPlaceSuggestion,
  type UnifiedSearchIntent,
} from "@/lib/place-search"
import { getServerSupabase } from "@/lib/supabase"

export type UnifiedSearchResults = {
  places: Awaited<ReturnType<typeof getPprAreaSuggestions>>
  addresses: PprSale[]
  planningApplications: PlanningApplication[]
  intent: UnifiedSearchIntent
  eircode: string | null
  locationContext: EircodeLocationContext | null
  nearbySales: NearbyPprSale[]
  nearbyPlanningApplications: NearbyPlanningApplication[]
  localMarket: EircodeLocalMarket | null
  dataUnavailable: boolean
}

export { searchExactEircode }
export type { ExactEircodeSearchDependencies }

function emptyResults(intent: UnifiedSearchIntent = "area"): UnifiedSearchResults {
  return {
    places: [],
    addresses: [],
    planningApplications: [],
    intent,
    eircode: null,
    locationContext: null,
    nearbySales: [],
    nearbyPlanningApplications: [],
    localMarket: null,
    dataUnavailable: false,
  }
}

export async function searchPropertyIntelligence(
  query: string
): Promise<UnifiedSearchResults> {
  const cleanedQuery = query.trim().replace(/\s+/g, " ").slice(0, 120)
  if (cleanedQuery.length < 2) {
    return emptyResults()
  }

  const canonicalEircode = normaliseEircode(cleanedQuery)
  try {
    return await searchPropertyIntelligenceCached(canonicalEircode ?? cleanedQuery)
  } catch {
    if (canonicalEircode) {
      return {
        ...emptyResults("eircode"),
        eircode: canonicalEircode,
        dataUnavailable: true,
      }
    }
    return emptyResults(classifyUnifiedSearchIntent(cleanedQuery))
  }
}

const searchPropertyIntelligenceCached = unstable_cache(
  async function searchPropertyIntelligenceUncached(
    cleanedQuery: string
  ): Promise<UnifiedSearchResults> {
  const supabase = getServerSupabase()
  const intent = classifyUnifiedSearchIntent(cleanedQuery)

  if (intent === "invalid-eircode") return emptyResults(intent)

  const eircode = normaliseEircode(cleanedQuery)
  if (intent === "eircode" && eircode) {
    const intelligence = await getEircodeIntelligence(eircode)
    return {
      places: [],
      addresses: intelligence.exactSales,
      planningApplications: intelligence.exactPlanningApplications,
      intent: "eircode",
      eircode,
      locationContext: intelligence.locationContext,
      nearbySales: intelligence.nearbySales,
      nearbyPlanningApplications: intelligence.nearbyPlanningApplications,
      localMarket: intelligence.localMarket,
      dataUnavailable: false,
    }
  }

  const planningTerm = escapePostgrestLike(cleanedQuery)
  const shouldSearchAddresses = intent === "address"

  let addressPromise: PromiseLike<{ data: unknown[] | null }> = Promise.resolve({ data: [] })
  if (shouldSearchAddresses) {
    const addressQuery = supabase
      .from("ppr_sales")
      .select(
        "id,date_of_sale,address_raw,address_normalised,locality,county,eircode,eircode_prefix,price_eur,area_slug"
      )

    addressPromise = addressQuery
      .textSearch("address_normalised", cleanedQuery, {
        config: "english",
        type: "plain",
      })
      .limit(5)
  }

  let planningQuery = supabase
    .from("planning_applications")
    .select(PLANNING_APPLICATION_SELECT)

  if (intent === "planning-reference") {
    planningQuery = planningQuery.ilike("reference", `%${planningTerm}%`)
  } else if (intent === "address") {
    planningQuery = planningQuery.ilike("location", `%${planningTerm}%`)
  } else {
    planningQuery = planningQuery.or(
      [
        `reference.ilike.%${planningTerm}%`,
        `location.ilike.%${planningTerm}%`,
        `proposal.ilike.%${planningTerm}%`,
        `applicant_name.ilike.%${planningTerm}%`,
      ].join(",")
    )
  }

  const [placeCandidates, planningResult, addressResult] = await Promise.all([
    intent === "planning-reference"
      ? Promise.resolve([])
      : getPprAreaSuggestions(cleanedQuery),
    planningQuery
      .order("registration_date", { ascending: false })
      .limit(8),
    addressPromise,
  ])
  const places = rankPlaceSuggestions(cleanedQuery, placeCandidates, 8)
  const exactPlace =
    intent === "area"
      ? selectUniqueExactPlaceSuggestion(cleanedQuery, places)
      : null
  const exactPlaceSalesResult = exactPlace
    ? await supabase
        .from("ppr_sales")
        .select(
          "id,date_of_sale,address_raw,address_normalised,locality,county,eircode,eircode_prefix,price_eur,area_slug"
        )
        .eq("county", exactPlace.county)
        .eq("area_slug", exactPlace.areaSlug)
        .order("date_of_sale", { ascending: false })
        .limit(6)
    : null
  const sales = exactPlace
    ? ((exactPlaceSalesResult?.data ?? []) as PprSale[])
    : rankAddressResults(
        cleanedQuery,
        (addressResult.data ?? []) as PprSale[],
        6
      )

  return {
    places,
    addresses: sales,
    planningApplications: ((planningResult.data ?? []) as PlanningApplication[]).sort(
      (a, b) => {
        const aExact = a.reference?.toLowerCase() === cleanedQuery.toLowerCase()
        const bExact = b.reference?.toLowerCase() === cleanedQuery.toLowerCase()
        return Number(bExact) - Number(aExact)
      }
    ),
    intent,
    eircode: null,
    locationContext: null,
    nearbySales: [],
    nearbyPlanningApplications: [],
    localMarket: null,
    dataUnavailable: false,
  }
  },
  ["unified-property-search", "v11-exact-place-sales"],
  { revalidate: 60 * 60 }
)

function escapePostgrestLike(value: string) {
  return value.replace(/[,%]/g, " ").replace(/\s+/g, " ").trim()
}
