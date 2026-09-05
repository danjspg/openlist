"use server"

import { revalidatePath } from "next/cache"
import { after } from "next/server"
import { requireUser } from "@/lib/auth"
import { initializePlanningAlertWatch } from "@/lib/planning-alert-initialization"
import { getServerSupabase } from "@/lib/supabase"

function subscriptionId(formData: FormData) {
  const value = String(formData.get("subscriptionId") ?? "").trim()
  if (!value) throw new Error("Alert subscription is required.")
  return value
}

function applicationId(formData: FormData) {
  const value = String(formData.get("applicationId") ?? "").trim()
  if (!value) throw new Error("Planning application is required.")
  return value
}

function returnPath(formData: FormData) {
  const value = String(formData.get("returnPath") ?? "").trim()
  return value.startsWith("/planning/") ? value : null
}

export async function enablePlanningAlert(formData: FormData) {
  const currentUser = await requireUser()
  const application_id = applicationId(formData)
  const supabase = getServerSupabase()

  const { data: existingSubscription, error: existingError } = await supabase
    .from("planning_alert_subscriptions")
    .select("id")
    .eq("user_id", currentUser.id)
    .eq("application_id", application_id)
    .maybeSingle()

  if (existingError) throw new Error(existingError.message)

  const { error } = await supabase
    .from("planning_alert_subscriptions")
    .upsert(
      { user_id: currentUser.id, application_id, enabled: true },
      { onConflict: "user_id,application_id" }
    )

  if (error) throw new Error(error.message)

  after(async () => {
    try {
      await initializePlanningAlertWatch(application_id)
    } catch (watchError) {
      console.error(`Immediate Planning alert baseline failed for ${application_id}.`, watchError)
    }
  })

  revalidatePath("/my-alerts")
  const path = returnPath(formData)
  if (path) revalidatePath(path)

  return { created: !existingSubscription }
}

export async function disablePlanningAlert(formData: FormData) {
  const currentUser = await requireUser()
  const id = subscriptionId(formData)
  const supabase = getServerSupabase()

  const { error } = await supabase
    .from("planning_alert_subscriptions")
    .update({ enabled: false })
    .eq("id", id)
    .eq("user_id", currentUser.id)

  if (error) throw new Error(error.message)

  revalidatePath("/my-alerts")
  const path = returnPath(formData)
  if (path) revalidatePath(path)
}

export async function deletePlanningAlert(formData: FormData) {
  const currentUser = await requireUser()
  const id = subscriptionId(formData)
  const { error } = await getServerSupabase()
    .from("planning_alert_subscriptions")
    .delete()
    .eq("id", id)
    .eq("user_id", currentUser.id)

  if (error) throw new Error(error.message)
  revalidatePath("/my-alerts")
}
