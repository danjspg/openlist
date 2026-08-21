import { getServerSupabase } from "@/lib/supabase"

export type PlanningAlertSubscription = {
  id: string
  user_id: string
  application_id: string
  enabled: boolean
  created_at: string
  updated_at: string
}

export async function getPlanningAlertSubscription(
  userId: string,
  applicationId: string
) {
  const { data, error } = await getServerSupabase()
    .from("planning_alert_subscriptions")
    .select("id,user_id,application_id,enabled,created_at,updated_at")
    .eq("user_id", userId)
    .eq("application_id", applicationId)
    .maybeSingle()

  if (error) throw new Error(error.message)
  return data as PlanningAlertSubscription | null
}
