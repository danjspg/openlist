import { unstable_cache } from "next/cache"
import { PLANNING_DATASET_CACHE_TAG } from "@/lib/dataset-cache"
import { getServerSupabase } from "@/lib/supabase"

export type HomepagePlanningSummary = {
  totalCount: number
  latestRegistrationDate: string | null
}

type PlanningAggregatePayload = {
  totalCount?: number | string | null
  latestRegistrationDate?: string | null
}

const getHomepagePlanningSummaryCached = unstable_cache(
  async (): Promise<HomepagePlanningSummary> => {
    const { data, error } = await getServerSupabase().rpc(
      "openlist_planning_dashboard_snapshot",
      { p_authority_code: "NATIONAL" }
    )

    if (error || !data) {
      throw new Error(
        `Homepage planning summary failed: ${error?.message ?? "empty response"}`
      )
    }

    const summary = data as PlanningAggregatePayload

    return {
      totalCount: Number(summary.totalCount ?? 0),
      latestRegistrationDate: summary.latestRegistrationDate ?? null,
    }
  },
  ["homepage-planning-summary", "v2-snapshot"],
  { revalidate: 60 * 60 * 6, tags: [PLANNING_DATASET_CACHE_TAG] }
)

export async function getHomepagePlanningSummary() {
  return getHomepagePlanningSummaryCached()
}
