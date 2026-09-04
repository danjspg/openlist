"use server"

import { revalidatePath } from "next/cache"
import { requireUser } from "@/lib/auth"
import {
  isPlanningAreaAlertCategory,
  isPlanningAreaAlertRadius,
  isPlanningAreaAlertTrigger,
} from "@/lib/planning-area-alerts"
import { getPlanningAuthorityBySlug } from "@/lib/planning-authorities"
import { areaSlug } from "@/lib/ppr"
import { planningGridToWgs84 } from "@/lib/property-intelligence"
import { getServerSupabase } from "@/lib/supabase"

function value(formData: FormData, name: string) {
  return String(formData.get(name) ?? "").trim()
}

function subscriptionId(formData: FormData) {
  const id = value(formData, "subscriptionId")
  if (!id) throw new Error("Area alert subscription is required.")
  return id
}

async function upsertAreaAlert({
  userId,
  sourceApplicationId,
  label,
  centerLat,
  centerLng,
  radiusM,
  category,
  trigger,
}: {
  userId: string
  sourceApplicationId: string | null
  label: string
  centerLat: number
  centerLng: number
  radiusM: number
  category: string
  trigger: string
}) {
  const supabase = getServerSupabase()
  let existingQuery = supabase
    .from("planning_area_alert_subscriptions")
    .select("id")
    .eq("user_id", userId)
    .eq("radius_m", radiusM)
    .eq("category", category)
    .eq("event_trigger", trigger)

  existingQuery = sourceApplicationId
    ? existingQuery.eq("source_application_id", sourceApplicationId)
    : existingQuery.is("source_application_id", null).eq("label", label)

  const { data: existing, error: existingError } = await existingQuery.maybeSingle()
  if (existingError) throw new Error(existingError.message)

  if (existing) {
    const { error } = await supabase
      .from("planning_area_alert_subscriptions")
      .update({
        label,
        center_lat: centerLat,
        center_lng: centerLng,
        enabled: true,
        updated_at: new Date().toISOString(),
      })
      .eq("id", existing.id)
      .eq("user_id", userId)
    if (error) throw new Error(error.message)
    revalidatePath("/my-alerts")
    revalidatePath("/my-alerts/areas")
    return { id: existing.id, created: false }
  }

  const { data, error } = await supabase
    .from("planning_area_alert_subscriptions")
    .insert({
      user_id: userId,
      source_application_id: sourceApplicationId,
      label,
      center_lat: centerLat,
      center_lng: centerLng,
      radius_m: radiusM,
      category,
      event_trigger: trigger,
      enabled: true,
    })
    .select("id")
    .single()
  if (error) throw new Error(error.message)

  revalidatePath("/my-alerts")
  revalidatePath("/my-alerts/areas")
  return { id: data.id, created: true }
}

export async function createPlanningAreaAlert(formData: FormData) {
  const currentUser = await requireUser()
  const sourceApplicationId = value(formData, "sourceApplicationId")
  const category = value(formData, "category")
  const trigger = value(formData, "eventTrigger") || "new"
  const radiusM = Number(value(formData, "radiusM"))

  if (!sourceApplicationId) throw new Error("Planning application location is required.")
  if (!isPlanningAreaAlertCategory(category)) throw new Error("Choose a valid development type.")
  if (!isPlanningAreaAlertTrigger(trigger)) throw new Error("Choose a valid alert event.")
  if (!isPlanningAreaAlertRadius(radiusM)) throw new Error("Choose a valid alert radius.")

  const supabase = getServerSupabase()
  const { data: application, error: applicationError } = await supabase
    .from("planning_applications")
    .select("id,reference,location,grid_easting,grid_northing")
    .eq("id", sourceApplicationId)
    .maybeSingle()
  if (applicationError) throw new Error(applicationError.message)
  if (!application) throw new Error("Planning application could not be found.")

  let coordinates = planningGridToWgs84(application)
  if (!coordinates) {
    const { data: sidecar, error: sidecarError } = await supabase
      .from("planning_application_locations")
      .select("grid_easting,grid_northing")
      .eq("application_id", sourceApplicationId)
      .maybeSingle()
    if (sidecarError) throw new Error(sidecarError.message)
    coordinates = sidecar ? planningGridToWgs84(sidecar) : null
  }
  if (!coordinates) throw new Error("This application does not have a reliable mapped location.")

  const label = (application.location?.trim() || `Planning application ${application.reference}`).slice(0, 180)
  return upsertAreaAlert({
    userId: currentUser.id,
    sourceApplicationId,
    label,
    centerLat: coordinates.lat,
    centerLng: coordinates.lng,
    radiusM,
    category,
    trigger,
  })
}

export async function createPlanningLocalityAreaAlert(formData: FormData) {
  const currentUser = await requireUser()
  const authoritySlug = value(formData, "authoritySlug")
  const localitySlug = value(formData, "localitySlug")
  const category = value(formData, "category")
  const radiusM = Number(value(formData, "radiusM"))

  const authority = getPlanningAuthorityBySlug(authoritySlug)
  if (!authority) throw new Error("Planning authority could not be found.")
  if (!localitySlug || areaSlug(localitySlug) !== localitySlug) throw new Error("Planning locality could not be found.")
  if (!isPlanningAreaAlertCategory(category)) throw new Error("Choose a valid development type.")
  if (!isPlanningAreaAlertRadius(radiusM)) throw new Error("Choose a valid alert radius.")

  const supabase = getServerSupabase()
  const { data: centerRows, error: centerError } = await supabase.rpc(
    "openlist_planning_locality_alert_center",
    {
      p_authority_code: authority.code,
      p_locality_slug: localitySlug,
    }
  )
  if (centerError) throw new Error("Could not resolve a reliable mapped centre for this locality.")
  const center = Array.isArray(centerRows) ? centerRows[0] : null
  const centerLat = Number(center?.center_lat)
  const centerLng = Number(center?.center_lng)
  if (!Number.isFinite(centerLat) || !Number.isFinite(centerLng)) {
    throw new Error("This locality does not yet have enough reliable mapped planning data for an area alert.")
  }

  const localityLabel = localitySlug
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ")
  const label = `${localityLabel}, ${authority.shortName}`.slice(0, 180)

  return upsertAreaAlert({
    userId: currentUser.id,
    sourceApplicationId: null,
    label,
    centerLat,
    centerLng,
    radiusM,
    category,
    trigger: "new",
  })
}

export async function disablePlanningAreaAlert(formData: FormData) {
  const currentUser = await requireUser()
  const id = subscriptionId(formData)
  const { error } = await getServerSupabase()
    .from("planning_area_alert_subscriptions")
    .update({ enabled: false, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", currentUser.id)
  if (error) throw new Error(error.message)
  revalidatePath("/my-alerts")
}

export async function enablePlanningAreaAlert(formData: FormData) {
  const currentUser = await requireUser()
  const id = subscriptionId(formData)
  const { error } = await getServerSupabase()
    .from("planning_area_alert_subscriptions")
    .update({ enabled: true, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", currentUser.id)
  if (error) throw new Error(error.message)
  revalidatePath("/my-alerts")
}

export async function deletePlanningAreaAlert(formData: FormData) {
  const currentUser = await requireUser()
  const id = subscriptionId(formData)
  const { error } = await getServerSupabase()
    .from("planning_area_alert_subscriptions")
    .delete()
    .eq("id", id)
    .eq("user_id", currentUser.id)
  if (error) throw new Error(error.message)
  revalidatePath("/my-alerts")
}
