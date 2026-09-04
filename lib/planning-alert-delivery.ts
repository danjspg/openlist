import type { SupabaseClient } from "@supabase/supabase-js"
import { runPlanningAreaAlertDelivery } from "@/lib/planning-area-alert-delivery"
import {
  PLANNING_ALERT_DELIVERY_BATCH_SIZE,
  PLANNING_ALERT_QUEUE_BATCH_SIZE,
} from "@/lib/planning-alert-delivery-rules"
import {
  sendPlanningAlertEmail,
  type PlanningAlertEmailDelivery,
} from "@/lib/planning-alert-email"
import { getServiceRoleSupabase } from "@/lib/supabase"

type ClaimedDelivery = PlanningAlertEmailDelivery & {
  delivery_claim_token: string
  user_id: string
  application_id: string
  event_id: string
  detected_at: string
}

type DeliveryRunResult = {
  queued: number
  claimed: number
  sent: number
  retried: number
  failed: number
  stale: number
  areaSubscriptions: number
  areaQueued: number
  areaQueueFailed: number
  areaClaimed: number
  areaSent: number
  areaFailed: number
  areaStale: number
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unknown planning alert delivery error"
}

async function failDelivery(
  supabase: SupabaseClient,
  delivery: ClaimedDelivery,
  error: unknown
) {
  const { data, error: rpcError } = await supabase.rpc(
    "openlist_fail_planning_alert_delivery",
    {
      p_delivery_id: delivery.delivery_id,
      p_claim_token: delivery.delivery_claim_token,
      p_error: errorMessage(error),
    }
  )
  if (rpcError) throw new Error(`Could not release failed delivery: ${rpcError.message}`)
  return String(data ?? "stale")
}

async function subscriptionCanReceive(
  supabase: SupabaseClient,
  delivery: ClaimedDelivery
) {
  const { data, error } = await supabase
    .from("planning_alert_subscriptions")
    .select("id")
    .eq("id", delivery.subscription_id)
    .eq("user_id", delivery.user_id)
    .eq("enabled", true)
    .maybeSingle()
  if (error) throw new Error(`Could not recheck subscription: ${error.message}`)
  return Boolean(data)
}

export async function runPlanningAlertDelivery(
  supabase = getServiceRoleSupabase()
): Promise<DeliveryRunResult> {
  const result: DeliveryRunResult = {
    queued: 0,
    claimed: 0,
    sent: 0,
    retried: 0,
    failed: 0,
    stale: 0,
    areaSubscriptions: 0,
    areaQueued: 0,
    areaQueueFailed: 0,
    areaClaimed: 0,
    areaSent: 0,
    areaFailed: 0,
    areaStale: 0,
  }

  const { data: enqueueData, error: enqueueError } = await supabase.rpc(
    "openlist_enqueue_planning_alert_deliveries",
    { p_limit: PLANNING_ALERT_QUEUE_BATCH_SIZE }
  )
  if (enqueueError) throw new Error(`Planning alert queue generation failed: ${enqueueError.message}`)
  result.queued = Number((enqueueData as { queued?: number } | null)?.queued ?? 0)

  const { data: claimData, error: claimError } = await supabase.rpc(
    "openlist_claim_planning_alert_deliveries",
    { p_limit: PLANNING_ALERT_DELIVERY_BATCH_SIZE }
  )
  if (claimError) throw new Error(`Planning alert claim failed: ${claimError.message}`)
  const deliveries = (claimData ?? []) as ClaimedDelivery[]
  result.claimed = deliveries.length

  for (const delivery of deliveries) {
    try {
      if (!(await subscriptionCanReceive(supabase, delivery))) {
        const state = await failDelivery(supabase, delivery, "Subscription is no longer enabled")
        if (state === "stale") result.stale += 1
        else if (state === "failed") result.failed += 1
        else result.retried += 1
        continue
      }

      const { data: userData, error: userError } = await supabase.auth.admin.getUserById(
        delivery.user_id
      )
      if (userError) throw new Error(`Could not load alert recipient: ${userError.message}`)
      const recipient = userData.user?.email?.trim()
      if (!recipient) throw new Error("Alert recipient has no email address")

      const providerMessageId = await sendPlanningAlertEmail(delivery, recipient)
      const { data: completed, error: completeError } = await supabase.rpc(
        "openlist_complete_planning_alert_delivery",
        {
          p_delivery_id: delivery.delivery_id,
          p_claim_token: delivery.delivery_claim_token,
          p_provider_message_id: providerMessageId,
        }
      )
      if (completeError) throw new Error(`Could not record sent delivery: ${completeError.message}`)
      if (!completed) throw new Error("Delivery claim expired before completion")
      result.sent += 1
    } catch (error) {
      console.error(`Planning alert delivery ${delivery.delivery_id} failed.`, error)
      const state = await failDelivery(supabase, delivery, error)
      if (state === "stale") result.stale += 1
      else if (state === "failed") result.failed += 1
      else result.retried += 1
    }
  }

  // Area alerts are private beta and deliberately fail independently so they
  // cannot interrupt the established single-application alert lane.
  try {
    Object.assign(result, await runPlanningAreaAlertDelivery(supabase))
  } catch (areaError) {
    result.areaQueueFailed += 1
    console.error("Planning area alert delivery run failed.", areaError)
  }

  return result
}
