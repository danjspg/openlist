import { NextResponse } from "next/server"
import { getPlanningAuthorityBySlug } from "@/lib/planning-authorities"
import { planningGridToWgs84, planningReferenceFromSlug } from "@/lib/property-intelligence"
import { getServerSupabase } from "@/lib/supabase"

export const dynamic = "force-dynamic"

type LocationRow = {
  grid_easting: number | string | null
  grid_northing: number | string | null
}

type PlanningLocationResult = LocationRow & {
  planning_application_locations?: LocationRow | LocationRow[] | null
}

export async function GET(request: Request) {
  const url = new URL(request.url)
  const authority = getPlanningAuthorityBySlug(url.searchParams.get("authority") ?? "")
  const reference = planningReferenceFromSlug(url.searchParams.get("reference") ?? "")

  if (!authority || !reference) {
    return NextResponse.json({ coordinates: null }, { status: 400 })
  }

  const { data, error } = await getServerSupabase()
    .from("planning_applications")
    .select("grid_easting,grid_northing,planning_application_locations(grid_easting,grid_northing)")
    .eq("local_authority_code", authority.code)
    .eq("reference", reference)
    .maybeSingle()

  if (error || !data) {
    return NextResponse.json(
      { coordinates: null },
      {
        status: error ? 503 : 404,
        headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=3600" },
      }
    )
  }

  const row = data as PlanningLocationResult

  // The existing server-rendered detail page already plots records whose
  // coordinates live on planning_applications. Only return a sidecar location
  // here so this lazy enhancement does not render a duplicate map.
  if (planningGridToWgs84(row)) {
    return NextResponse.json(
      { coordinates: null },
      { headers: { "Cache-Control": "public, s-maxage=21600, stale-while-revalidate=86400" } }
    )
  }

  const related = Array.isArray(row.planning_application_locations)
    ? row.planning_application_locations[0] ?? null
    : row.planning_application_locations ?? null
  const coordinates = related ? planningGridToWgs84(related) : null

  return NextResponse.json(
    { coordinates },
    { headers: { "Cache-Control": "public, s-maxage=21600, stale-while-revalidate=86400" } }
  )
}
