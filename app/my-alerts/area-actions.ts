"use server"

import { revalidatePath } from "next/cache"
import { requireUser } from "@/lib/auth"
import {
  isPlanningAreaAlertCategory,
  isPlanningAreaAlertRadius,
  isPlanningAreaAlertTrigger,
} from "@/lib/planning-area-alerts"
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

export async function createPlanningAreaAlert(formData: FormData) {
  const currentUser = await requireUser()
  const sourceApplicationId = value(formData, "sourceApplicationId")
  const category = value(formData, "category")
  const trigger = value(formData, "eventTrigger")
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
  const { data: existing, error: existingError } = await supabase
    .from("planning_area_alert_subscriptions")
    .select("id")
    .eq("user_id", currentUser.id)
    .eq("source_application_id", sourceApplicationId)
    .eq("radius_m", radiusM)
    .eq("category", category)
    .eq("event_trigger", trigger)
    .maybeSingle()
  if (existingError) throw new Error(existingError.message)

  if (existing) {
    const { error } = await supabase
      .from("planning_area_alert_subscriptions")
      .update({
        label,
        center_lat: coordinates.lat,
        center_lng: coordinates.lng,
        enabled: true,
        updated_at: new Date().toISOString(),
      })
      .eq("id", existing.id)
      .eq("user_id", currentUser.id)
    if (error) throw new Error(error.message)
    revalidatePath("/my-alerts")
    return { id: existing.id, created: false }
  }

  const { data, error } = await supabase
    .from("planning_area_alert_subscriptions")
    .insert({
      user_id: currentUser.id,
      source_application_id: sourceApplicationId,
      label,
      center_lat: coordinates.lat,
      center_lng: coordinates.lng,
      radius_m: radiusM,
      category,
      event_trigger: trigger,
      enabled: true,
    })
    .select("id")
    .single()
  if (error) throw new Error(error.message)

  revalidatePath("/my-alerts")
  return { id: data.id, created: true }
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
