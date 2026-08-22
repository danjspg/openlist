import { getServerSupabase } from "@/lib/supabase"
export { LOCALITY_COHORT_SIZE, LOCALITY_MIN_RESIDENCE_DAYS, LOCALITY_MAX_ROTATION, localityPath, selectCohort } from "@/lib/locality-seo-core"
import { LOCALITY_COHORT_SIZE } from "@/lib/locality-seo-core"

export type LocalitySitemapRow = { canonical_path: string; last_modified: string | null }
export type LocalityMembership = {
  canonical_path: string
  county: string | null
  authority_code: string | null
  locality_label: string
  locality_slug: string
  evidence: { applicationCount?: number; latestRegistrationDate?: string | null }
}

export async function getLocalitySitemap(surface: "sold_prices" | "planning") {
  const { data, error } = await getServerSupabase().rpc("openlist_locality_seo_sitemap", {
    p_surface: surface,
    p_limit: LOCALITY_COHORT_SIZE,
  })
  if (error) {
    console.warn(`Locality sitemap selection failed for ${surface}.`, error.message)
    return [] as LocalitySitemapRow[]
  }
  return (data || []) as LocalitySitemapRow[]
}

export async function getPlanningLocalityMembership(authorityCode: string, slug: string) {
  const { data, error } = await getServerSupabase()
    .from("locality_seo_memberships")
    .select("canonical_path,county,authority_code,locality_label,locality_slug,evidence")
    .eq("surface", "planning")
    .eq("authority_code", authorityCode)
    .eq("locality_slug", slug)
    .is("left_at", null)
    .maybeSingle()
  if (error) return null
  return data as LocalityMembership | null
}
