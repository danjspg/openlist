import { NextRequest, NextResponse } from "next/server"
import { getPlanningSearchPage } from "@/lib/planning-search-page"
import { planningResultRecord } from "@/lib/planning-result-presentation"

export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams
  try {
    const page = await getPlanningSearchPage({
      q: params.get("q") ?? undefined,
      area: params.get("area") ?? undefined,
      council: params.get("council") ?? undefined,
      status: params.get("status") ?? undefined,
      type: params.get("type") ?? undefined,
      construction: params.get("construction") ?? undefined,
      sort: params.get("sort") ?? undefined,
      authority: params.get("authority") ?? undefined,
      offset: Number(params.get("offset") ?? 0),
      limit: Number(params.get("limit") ?? 25),
    })

    return NextResponse.json({
      ...page,
      results: page.results.map(planningResultRecord),
    })
  } catch (error) {
    console.error("Planning paged search failed.", error)
    return NextResponse.json(
      { error: "Planning search is temporarily unavailable. Please try again." },
      { status: 503 }
    )
  }
}
