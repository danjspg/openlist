import { unstable_cache } from "next/cache"
import { ACTIVE_PLANNING_STATUSES } from "@/lib/planning-status"
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

export type PlanningLocalityDirectoryEntry = LocalityMembership & {
  activeCount: number
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

async function countPlanningLocalityActiveApplications(membership: LocalityMembership) {
  if (!membership.authority_code) return 0

  const { count, error } = await getServerSupabase()
    .from("planning_applications")
    .select("id", { count: "exact", head: true })
    .eq("local_authority_code", membership.authority_code)
    .ilike("location", `%${membership.locality_label}%`)
    .in("normalized_status", [...ACTIVE_PLANNING_STATUSES])

  if (error) {
    console.warn(`Planning locality active count failed for ${membership.canonical_path}.`, error.message)
    return 0
  }

  return count ?? 0
}

const getPlanningLocalityDirectoryCached = unstable_cache(async () => {
  const sitemap = await getLocalitySitemap("planning")
  const paths = sitemap.map((row) => row.canonical_path)
  if (!paths.length) return [] as PlanningLocalityDirectoryEntry[]

  const { data, error } = await getServerSupabase()
    .from("locality_seo_memberships")
    .select("canonical_path,county,authority_code,locality_label,locality_slug,evidence")
    .eq("surface", "planning")
    .is("left_at", null)
    .in("canonical_path", paths)

  if (error) {
    console.warn("Planning locality directory lookup failed.", error.message)
    return [] as PlanningLocalityDirectoryEntry[]
  }

  const byPath = new Map((data || []).map((row) => [row.canonical_path, row as LocalityMembership]))
  const memberships = paths
    .map((path) => byPath.get(path))
    .filter((row): row is LocalityMembership => Boolean(row))

  const entries: PlanningLocalityDirectoryEntry[] = []
  const batchSize = 12
  for (let index = 0; index < memberships.length; index += batchSize) {
    const batch = memberships.slice(index, index + batchSize)
    const counts = await Promise.all(batch.map(countPlanningLocalityActiveApplications))
    entries.push(...batch.map((membership, batchIndex) => ({
      ...membership,
      activeCount: counts[batchIndex] ?? 0,
    })))
  }

  return entries
}, ["planning-locality-directory", "v2-active-counts"], { revalidate: 60 * 60 * 6 })

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
