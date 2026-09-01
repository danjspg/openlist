import { unstable_cache } from "next/cache"
import { cache } from "react"
import { PLANNING_DATASET_CACHE_TAG } from "@/lib/dataset-cache"
import { getServerSupabase } from "@/lib/supabase"

export type PlanningCanonicalPlaceMembership = {
  authority_code: string
  locality_slug: string
  locality_label: string
  confidence: number
}

export type PlanningCanonicalPlace = {
  slug: string
  display_name: string
  place_type: string
  county: string | null
  confidence: number
  aggregate_enabled: boolean
  updated_at: string | null
  memberships: PlanningCanonicalPlaceMembership[]
}

const getPlanningCanonicalPlaceCached = unstable_cache(async (slug: string): Promise<PlanningCanonicalPlace | null> => {
  const supabase = getServerSupabase()
  const { data: place, error: placeError } = await supabase
    .from("planning_canonical_places")
    .select("slug,display_name,place_type,county,confidence,aggregate_enabled,updated_at")
    .eq("slug", slug)
    .maybeSingle()

  if (placeError) throw new Error("Planning canonical place unavailable")
  if (!place) return null

  const { data: memberships, error: membershipError } = await supabase
    .from("planning_canonical_place_memberships")
    .select("authority_code,locality_slug,locality_label,confidence")
    .eq("place_slug", slug)
    .order("authority_code", { ascending: true })

  if (membershipError) throw new Error("Planning canonical place memberships unavailable")
  if (!memberships?.length) return null

  return {
    ...place,
    confidence: Number(place.confidence || 0),
    aggregate_enabled: Boolean(place.aggregate_enabled),
    memberships: memberships.map((membership) => ({
      ...membership,
      confidence: Number(membership.confidence || 0),
    })),
  } as PlanningCanonicalPlace
}, ["planning-canonical-place", "v1"], {
  revalidate: 60 * 60 * 6,
  tags: [PLANNING_DATASET_CACHE_TAG],
})

export const getPlanningCanonicalPlace = cache((slug: string) =>
  getPlanningCanonicalPlaceCached(slug)
)

export async function getAggregatePlanningCanonicalPlaces() {
  const { data, error } = await getServerSupabase()
    .from("planning_canonical_places")
    .select("slug,display_name,updated_at")
    .eq("aggregate_enabled", true)
    .order("display_name", { ascending: true })

  if (error) {
    console.warn("Planning aggregate place lookup failed.", error.message)
    return [] as Array<{ slug: string; display_name: string; updated_at: string | null }>
  }

  return (data || []) as Array<{ slug: string; display_name: string; updated_at: string | null }>
}
