import { getPprAreaSuggestions, type PprSale } from "@/lib/ppr"
import {
  PLANNING_APPLICATION_SELECT,
  type PlanningApplication,
} from "@/lib/planning"
import { extractEircode } from "@/lib/property-intelligence"
import {
  classifyUnifiedSearchIntent,
  rankAddressResults,
  rankPlaceSuggestions,
} from "@/lib/place-search"
import { getServerSupabase } from "@/lib/supabase"

export type UnifiedSearchResults = {
  places: Awaited<ReturnType<typeof getPprAreaSuggestions>>
  addresses: PprSale[]
  planningApplications: PlanningApplication[]
}

export async function searchPropertyIntelligence(
  query: string
): Promise<UnifiedSearchResults> {
  const cleanedQuery = query.trim().replace(/\s+/g, " ").slice(0, 120)
  if (cleanedQuery.length < 2) {
    return { places: [], addresses: [], planningApplications: [] }
  }

  const supabase = getServerSupabase()
  const planningTerm = escapePostgrestLike(cleanedQuery)
  const eircode = extractEircode(cleanedQuery)
  const intent = classifyUnifiedSearchIntent(cleanedQuery)
  const shouldSearchAddresses = intent === "eircode" || intent === "address"

  let addressPromise: PromiseLike<{ data: unknown[] | null }> = Promise.resolve({ data: [] })
  if (shouldSearchAddresses) {
    const addressQuery = supabase
      .from("ppr_sales")
      .select(
        "id,date_of_sale,address_raw,address_normalised,locality,county,eircode,eircode_prefix,price_eur,area_slug"
      )

    if (eircode) {
      addressPromise = addressQuery
        .eq("eircode", eircode)
        .order("date_of_sale", { ascending: false })
        .limit(6)
    } else {
      addressPromise = addressQuery
        .textSearch("address_normalised", cleanedQuery, {
          config: "english",
          type: "plain",
        })
        .limit(5)
    }
  }

  let planningQuery = supabase
    .from("planning_applications")
    .select(PLANNING_APPLICATION_SELECT)

  if (intent === "planning-reference") {
    planningQuery = planningQuery.ilike("reference", `%${planningTerm}%`)
  } else if (intent === "address" || intent === "eircode") {
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

  const [places, planningResult, addressResult] = await Promise.all([
    intent === "planning-reference"
      ? Promise.resolve([])
      : getPprAreaSuggestions(cleanedQuery),
    planningQuery
      .order("registration_date", { ascending: false })
      .limit(8),
    addressPromise,
  ])

  return {
    places: rankPlaceSuggestions(cleanedQuery, places, 8),
    addresses: rankAddressResults(
      cleanedQuery,
      (addressResult.data ?? []) as PprSale[],
      6
    ),
    planningApplications: ((planningResult.data ?? []) as PlanningApplication[]).sort(
      (a, b) => {
        const aExact = a.reference?.toLowerCase() === cleanedQuery.toLowerCase()
        const bExact = b.reference?.toLowerCase() === cleanedQuery.toLowerCase()
        return Number(bExact) - Number(aExact)
      }
    ),
  }
}

function escapePostgrestLike(value: string) {
  return value.replace(/[,%]/g, " ").replace(/\s+/g, " ").trim()
}
