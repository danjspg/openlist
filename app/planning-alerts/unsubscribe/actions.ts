"use server"

import { redirect } from "next/navigation"
import { verifyPlanningAlertUnsubscribeToken } from "@/lib/planning-alert-unsubscribe"
import { getServiceRoleSupabase } from "@/lib/supabase"

export async function unsubscribePlanningAlert(formData: FormData) {
  const token = String(formData.get("token") ?? "")
  let subscriptionId: string | null = null
  try {
    subscriptionId = verifyPlanningAlertUnsubscribeToken(token)
  } catch (error) {
    console.error("Planning alert unsubscribe validation failed.", error)
  }
  if (!subscriptionId) redirect("/planning-alerts/unsubscribe?status=invalid")

  const { error } = await getServiceRoleSupabase()
    .from("planning_alert_subscriptions")
    .update({ enabled: false })
    .eq("id", subscriptionId)

  if (error) throw new Error(`Could not stop planning updates: ${error.message}`)
  redirect("/planning-alerts/unsubscribe?status=stopped")
}
