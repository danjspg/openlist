import { unstable_cache } from "next/cache"
import { getServerSupabase } from "@/lib/supabase"
export { LOCALITY_COHORT_SIZE, LOCALITY_MIN_RESIDENCE_DAYS, LOCALITY_MAX_ROTATION, localityPath, selectCohort } from "@/lib/locality-seo-core"
import { LOCALITY_COHORT_SIZE } from "@/lib/locality-seo-core"

const PLANNING_LOCALITY_LIMIT = 3000

export type LocalitySitemapRow = { canonical_path: string; last_modified: string | null }
export type LocalityMembership = {
  canonical_path: string
  county: string | null
  authority_code: string | null
  locality_label: string
  locality_slug: string
  evidence: { applicationCount?: number; latestRegistrationDate?: string | null }
}

export type PlanningLocalityDirectoryEntry = LocalityMembership & {
  activeCount: number
}

type PlanningLocalityDirectoryRow = LocalityMembership & {
  active_count: number | string | null
}

export async function getLocalitySitemap(surface: "sold_prices" | "planning") {
  const { data, error } = await getServerSupabase().rpc("openlist_locality_seo_sitemap", {
    p_surface: surface,
    p_limit: surface === "planning" ? PLANNING_LOCALITY_LIMIT : LOCALITY_COHORT_SIZE,
  })
  if (error) {
    console.warn(`Locality sitemap selection failed for ${surface}.`, error.message)
    return [] as LocalitySitemapRow[]
  }
  return (data || []) as LocalitySitemapRow[]
}

const getPlanningLocalityDirectoryCached = unstable_cache(async () => {
  const { data, error } = await getServerSupabase().rpc("openlist_planning_locality_directory", {
    p_limit: PLANNING_LOCALITY_LIMIT,
  })

  if (error) {
    console.warn("Planning locality directory lookup failed.", error.message)
    return [] as PlanningLocalityDirectoryEntry[]
  }

  return ((data || []) as PlanningLocalityDirectoryRow[]).map((row) => ({
    canonical_path: row.canonical_path,
    county: row.county,
    authority_code: row.authority_code,
    locality_label: row.locality_label,
    locality_slug: row.locality_slug,
    evidence: row.evidence,
    activeCount: Number(row.active_count || 0),
  }))
}, ["planning-locality-directory", "v3-set-based-expanded"], { revalidate: 60 * 60 * 6 })

export async function getPlanningLocalityDirectory() {
  return getPlanningLocalityDirectoryCached()
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
