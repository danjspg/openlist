import { unstable_cache } from "next/cache"
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
      "openlist_planning_dashboard_aggregate",
      {
        p_authority_code: null,
        p_q: null,
        p_area: null,
        p_status: null,
        p_application_type: null,
      }
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
  ["homepage-planning-summary", "v1"],
  { revalidate: 60 * 60 * 6 }
)

export async function getHomepagePlanningSummary() {
  return getHomepagePlanningSummaryCached()
}
