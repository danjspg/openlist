import { unstable_cache } from "next/cache"
import { areaSlug } from "@/lib/ppr"
import { getOptionalServerSupabase, getServerSupabase } from "@/lib/supabase"
export { LOCALITY_COHORT_SIZE, LOCALITY_MIN_RESIDENCE_DAYS, LOCALITY_MAX_ROTATION, localityPath, selectCohort } from "@/lib/locality-seo-core"
import { LOCALITY_COHORT_SIZE } from "@/lib/locality-seo-core"

const PLANNING_LOCALITY_LIMIT = 3000
const POSTGREST_PAGE_SIZE = 1000

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
  if (surface === "planning") return getPlanningLocalitySitemap("priority")

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

export async function getPlanningLocalitySitemap(tier: "priority" | "expanded") {
  const rows: LocalitySitemapRow[] = []
  for (let from = 0; from < PLANNING_LOCALITY_LIMIT; from += POSTGREST_PAGE_SIZE) {
    const { data, error } = await getServerSupabase()
      .rpc("openlist_planning_locality_sitemap", {
        p_tier: tier,
        p_limit: PLANNING_LOCALITY_LIMIT,
      })
      .range(from, Math.min(from + POSTGREST_PAGE_SIZE - 1, PLANNING_LOCALITY_LIMIT - 1))
    if (error) {
      console.warn(`Planning locality ${tier} sitemap selection failed.`, error.message)
      return [] as LocalitySitemapRow[]
    }
    const page = (data || []) as LocalitySitemapRow[]
    rows.push(...page)
    if (page.length < POSTGREST_PAGE_SIZE) break
  }
  return rows
}

const getPlanningLocalityDirectoryCached = unstable_cache(async () => {
  const rows: PlanningLocalityDirectoryRow[] = []
  for (let from = 0; from < PLANNING_LOCALITY_LIMIT; from += POSTGREST_PAGE_SIZE) {
    const { data, error } = await getOptionalServerSupabase()
      .rpc("openlist_planning_locality_directory", { p_limit: PLANNING_LOCALITY_LIMIT })
      .range(from, Math.min(from + POSTGREST_PAGE_SIZE - 1, PLANNING_LOCALITY_LIMIT - 1))
    if (error) {
      throw new Error("Planning locality directory snapshot unavailable")
    }
    const page = (data || []) as PlanningLocalityDirectoryRow[]
    rows.push(...page)
    if (page.length < POSTGREST_PAGE_SIZE) break
  }

  return rows.map((row) => ({
    canonical_path: row.canonical_path,
    county: row.county,
    authority_code: row.authority_code,
    locality_label: row.locality_label,
    locality_slug: row.locality_slug,
    evidence: row.evidence,
    activeCount: Number(row.active_count || 0),
  }))
}, ["planning-locality-directory", "v5-paged-snapshot-counts"], { revalidate: 60 * 60 * 6 })

const getPlanningRoutableLocalitySlugsCached = unstable_cache(async (authorityCode: string) => {
  const { data, error } = await getOptionalServerSupabase().rpc("openlist_planning_dashboard_snapshot", {
    p_authority_code: authorityCode,
  })
  if (error || !data) {
    throw new Error("Planning routable locality snapshot unavailable")
  }

  const snapshot = data as { areaOptions?: unknown }
  if (!Array.isArray(snapshot.areaOptions)) return [] as string[]
  return snapshot.areaOptions.map((label) => areaSlug(String(label))).filter(Boolean)
}, ["planning-routable-locality-slugs", "v1-dashboard-snapshot"], { revalidate: 60 * 60 * 6 })

export async function getPlanningLocalityDirectory() {
  return getPlanningLocalityDirectoryCached()
}

export async function getPlanningRoutableLocalitySlugs(authorityCode: string) {
  return getPlanningRoutableLocalitySlugsCached(authorityCode)
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
