import { NextResponse } from "next/server"
import { getPprDatasetSummary } from "@/lib/ppr"
import { getPlanningAuthorityBySlug } from "@/lib/planning-authorities"
import { getServerSupabase } from "@/lib/supabase"

export const revalidate = 21600

type PlanningAggregatePayload = {
  totalCount?: number | string | null
  latestRegistrationDate?: string | null
}

export async function GET(request: Request) {
  const supabase = getServerSupabase()
  const url = new URL(request.url)
  const authoritySlug = url.searchParams.get("authority")?.trim() || null
  const authority = authoritySlug ? getPlanningAuthorityBySlug(authoritySlug) : null

  const [planningResult, soldPriceSummary] = await Promise.all([
    supabase.rpc("openlist_planning_dashboard_aggregate", {
      p_authority_code: authority?.code ?? null,
      p_q: null,
      p_area: null,
      p_status: null,
      p_application_type: null,
    }),
    getPprDatasetSummary().catch((error) => {
      console.warn("Could not load sold-price dataset summary", error)
      return null
    }),
  ])

  if (planningResult.error) {
    console.warn("Could not load planning data freshness", planningResult.error)
  }

  const planning = planningResult.data as PlanningAggregatePayload | null
  const planningCount = Number(planning?.totalCount ?? 0)

  return NextResponse.json(
    {
      planning: planning?.latestRegistrationDate ?? null,
      planningCount: Number.isFinite(planningCount) && planningCount > 0 ? planningCount : null,
      planningAuthority: authority?.shortName ?? null,
      soldPrices: soldPriceSummary?.latestSaleDate ?? null,
      soldPriceCount: soldPriceSummary?.salesCount ?? null,
      soldPriceStartYear: soldPriceSummary?.startYear ?? null,
    },
    {
      headers: {
        "Cache-Control": "public, s-maxage=21600, stale-while-revalidate=86400",
      },
    }
  )
}
