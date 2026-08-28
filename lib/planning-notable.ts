import { cache } from "react"
import { unstable_cache } from "next/cache"
import { PLANNING_DATASET_CACHE_TAG } from "@/lib/dataset-cache"
import { getServerSupabase } from "@/lib/supabase"

export type PlanningNotableEnrichment = {
  applicationId: string
  displayName: string | null
  searchAliases: string[]
  reason: string
  source: string
  evidence: Record<string, unknown>
}

const getPlanningNotableEnrichmentCached = unstable_cache(
  async (applicationId: string): Promise<PlanningNotableEnrichment | null> => {
    const { data, error } = await getServerSupabase()
      .from("planning_seo_notable")
      .select("application_id,display_name,search_aliases,reason,source,evidence")
      .eq("application_id", applicationId)
      .eq("active", true)
      .maybeSingle()

    if (error) {
      console.warn("Planning notable enrichment query failed.", error.message)
      return null
    }
    if (!data) return null

    return {
      applicationId: String(data.application_id),
      displayName: typeof data.display_name === "string" ? data.display_name : null,
      searchAliases: Array.isArray(data.search_aliases)
        ? data.search_aliases.map(String).filter(Boolean)
        : [],
      reason: String(data.reason ?? ""),
      source: String(data.source ?? ""),
      evidence:
        data.evidence && typeof data.evidence === "object"
          ? (data.evidence as Record<string, unknown>)
          : {},
    }
  },
  ["planning-notable-enrichment", "v1"],
  { revalidate: 60 * 60, tags: [PLANNING_DATASET_CACHE_TAG] }
)

export const getPlanningNotableEnrichment = cache(
  async (applicationId: string) => getPlanningNotableEnrichmentCached(applicationId)
)

export async function getPlanningNotableAliasIds(query: string, limit = 100) {
  const cleaned = query.trim().replace(/\s+/g, " ").slice(0, 120)
  if (cleaned.length < 2) return [] as string[]

  const { data, error } = await getServerSupabase().rpc(
    "openlist_planning_notable_alias_ids",
    { p_q: cleaned, p_limit: Math.max(1, Math.min(limit, 500)) }
  )

  if (error) {
    console.warn("Planning notable alias lookup failed.", error.message)
    return [] as string[]
  }

  return Array.isArray(data) ? data.map(String) : []
}
