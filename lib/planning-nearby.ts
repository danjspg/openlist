import type { PlanningResultRecord } from "@/components/planning/PlanningApplicationResult"
import { PLANNING_APPLICATION_SELECT, type PlanningApplication } from "@/lib/planning"
import { planningResultRecord } from "@/lib/planning-result-presentation"
import { planningGridToWgs84 } from "@/lib/property-intelligence"
import { getServerSupabase } from "@/lib/supabase"

export type NearbyPlanningRecord = PlanningResultRecord & {
  distanceM: number
}

export type NearbyPlanningMapData = {
  sourceApplicationId: string
  center: { lat: number; lng: number }
  applications: NearbyPlanningRecord[]
  radiusM: number
}

const DEFAULT_RADIUS_M = 2_000
const DEFAULT_LIMIT = 40
const DEFAULT_YEARS = 3

export async function getNearbyPlanningMap(
  application: PlanningApplication,
  radiusM = DEFAULT_RADIUS_M,
  limit = DEFAULT_LIMIT
): Promise<NearbyPlanningMapData | null> {
  const boundedRadius = Math.min(Math.max(Math.round(radiusM), 100), 50_000)
  const boundedLimit = Math.min(Math.max(Math.round(limit), 1), 100)
  const candidateLimit = Math.min(Math.max(boundedLimit * 6, 120), 600)
  const supabase = getServerSupabase()

  const center = await resolvePlanningCoordinates(application)
  if (!center) return null
  const base = { sourceApplicationId: application.id, center, radiusM: boundedRadius }

  const { data: nearbyRows, error: nearbyError } = await supabase.rpc(
    "openlist_planning_applications_within_radius",
    {
      p_lat: center.lat,
      p_lng: center.lng,
      p_radius_m: boundedRadius,
      p_limit: candidateLimit,
    }
  )

  if (nearbyError) {
    console.warn("Nearby planning radius lookup failed.", nearbyError.message)
    return { ...base, applications: [] }
  }

  const distances = new Map<string, number>()
  for (const row of nearbyRows ?? []) {
    if (!row.application_id || row.application_id === application.id) continue
    if (!Number.isFinite(Number(row.distance_m))) continue
    distances.set(row.application_id, Number(row.distance_m))
  }

  const ids = [...distances.keys()]
  if (ids.length === 0) return { ...base, applications: [] }

  const [{ data: applications, error: applicationsError }, { data: locations, error: locationsError }] = await Promise.all([
    supabase
      .from("planning_applications")
      .select(PLANNING_APPLICATION_SELECT)
      .in("id", ids),
    supabase
      .from("planning_application_locations")
      .select("application_id,grid_easting,grid_northing")
      .in("application_id", ids),
  ])

  if (applicationsError) {
    console.warn("Nearby planning application lookup failed.", applicationsError.message)
    return { ...base, applications: [] }
  }

  if (locationsError) {
    console.warn("Nearby planning sidecar lookup failed.", locationsError.message)
  }

  const cutoff = new Date()
  cutoff.setUTCFullYear(cutoff.getUTCFullYear() - DEFAULT_YEARS)
  const cutoffDate = cutoff.toISOString().slice(0, 10)
  const sidecarById = new Map(
    (locations ?? []).map((location) => [location.application_id, location] as const)
  )

  const records = ((applications ?? []) as PlanningApplication[])
    .filter((row) => row.registration_date && row.registration_date >= cutoffDate)
    .map((row) => {
      const sidecar = sidecarById.get(row.id)
      const hydrated = planningGridToWgs84(row)
        ? row
        : sidecar
          ? { ...row, grid_easting: sidecar.grid_easting, grid_northing: sidecar.grid_northing }
          : row
      const record = planningResultRecord(hydrated)
      const distanceM = distances.get(row.id)
      if (!record.coordinates || distanceM === undefined) return null
      return { ...record, distanceM }
    })
    .filter((record): record is NearbyPlanningRecord => record !== null)
    .sort((left, right) => left.distanceM - right.distanceM)
    .slice(0, boundedLimit)

  return {
    ...base,
    applications: records,
  }
}

async function resolvePlanningCoordinates(application: PlanningApplication) {
  const native = planningGridToWgs84(application)
  if (native) return native

  const { data, error } = await getServerSupabase()
    .from("planning_application_locations")
    .select("grid_easting,grid_northing")
    .eq("application_id", application.id)
    .maybeSingle()

  if (error) {
    console.warn("Planning location sidecar lookup failed.", error.message)
    return null
  }

  return data ? planningGridToWgs84(data) : null
}
