import type { SupabaseClient } from "@supabase/supabase-js"
import type { PlanningAreaAlertSubscription } from "@/lib/planning-area-alerts"
import {
  sendPlanningAreaAlertEmail,
  type PlanningAreaAlertEmailDelivery,
} from "@/lib/planning-area-alert-email"
import { getServiceRoleSupabase } from "@/lib/supabase"

const MAX_SUBSCRIPTIONS_PER_RUN = 50
const MAX_CANDIDATE_EVENTS_PER_SUBSCRIPTION = 250
const MAX_QUEUE_ROWS_PER_RUN = 250
const MAX_DELIVERIES_PER_RUN = 20

type CandidateEvent = {
  event_id: string
  application_id: string
  distance_m: number | string
}

type PendingDelivery = {
  id: string
  subscription_id: string
  application_id: string
  event_id: string
  distance_m: number
  attempts: number
  planning_area_alert_subscriptions: {
    user_id: string
    label: string
    radius_m: number
    category: string
    event_trigger: string
    enabled: boolean
  } | Array<{
    user_id: string
    label: string
    radius_m: number
    category: string
    event_trigger: string
    enabled: boolean
  }> | null
  planning_applications: {
    local_authority_code: string
    reference: string
    proposal: string | null
    location: string | null
  } | Array<{
    local_authority_code: string
    reference: string
    proposal: string | null
    location: string | null
  }> | null
  planning_application_events: {
    event_type: string
    event_date: string
    label: string
  } | Array<{
    event_type: string
    event_date: string
    label: string
  }> | null
}

function one<T>(value: T | T[] | null): T | null {
  return Array.isArray(value) ? value[0] ?? null : value
}

async function queueForSubscription(
  supabase: SupabaseClient,
  subscription: PlanningAreaAlertSubscription,
  remainingCapacity: number
) {
  if (remainingCapacity <= 0) return 0

  // Match lifecycle event, spatial radius and notable category in Postgres before
  // applying a result limit. Limiting a generic radius lookup first could silently
  // miss a wind farm or residential scheme behind hundreds of unrelated nearby rows.
  const { data, error } = await supabase.rpc(
    "openlist_planning_area_alert_candidates",
    {
      p_subscription_id: subscription.id,
      p_lat: subscription.center_lat,
      p_lng: subscription.center_lng,
      p_radius_m: subscription.radius_m,
      p_category: subscription.category,
      p_event_trigger: subscription.event_trigger,
      p_created_after: subscription.created_at,
      p_limit: Math.min(MAX_CANDIDATE_EVENTS_PER_SUBSCRIPTION, remainingCapacity),
    }
  )
  if (error) throw new Error(`Area candidate lookup failed: ${error.message}`)

  const queueRows = ((data ?? []) as CandidateEvent[])
    .map((event) => ({
      subscription_id: subscription.id,
      application_id: event.application_id,
      event_id: event.event_id,
      distance_m: Number(event.distance_m),
    }))
    .filter((event) => Number.isFinite(event.distance_m))
    .slice(0, remainingCapacity)

  if (queueRows.length === 0) return 0

  const { data: inserted, error: insertError } = await supabase
    .from("planning_area_alert_deliveries")
    .upsert(queueRows, {
      onConflict: "subscription_id,event_id",
      ignoreDuplicates: true,
    })
    .select("id")
  if (insertError) throw new Error(`Area delivery queue insert failed: ${insertError.message}`)
  return inserted?.length ?? 0
}

async function sendPendingAreaDeliveries(supabase: SupabaseClient) {
  const result = { areaClaimed: 0, areaSent: 0, areaFailed: 0, areaStale: 0 }
  const { data, error } = await supabase
    .from("planning_area_alert_deliveries")
    .select(`
      id,subscription_id,application_id,event_id,distance_m,attempts,
      planning_area_alert_subscriptions(user_id,label,radius_m,category,event_trigger,enabled),
      planning_applications(local_authority_code,reference,proposal,location),
      planning_application_events(event_type,event_date,label)
    `)
    .is("sent_at", null)
    .lt("attempts", 5)
    .order("queued_at", { ascending: true })
    .limit(MAX_DELIVERIES_PER_RUN)
  if (error) throw new Error(`Area pending delivery lookup failed: ${error.message}`)

  const deliveries = (data ?? []) as unknown as PendingDelivery[]
  result.areaClaimed = deliveries.length

  for (const delivery of deliveries) {
    const subscription = one(delivery.planning_area_alert_subscriptions)
    const application = one(delivery.planning_applications)
    const event = one(delivery.planning_application_events)

    if (!subscription?.enabled || !application || !event) {
      await supabase
        .from("planning_area_alert_deliveries")
        .update({ attempts: 5, last_error: "Alert or source record is no longer available" })
        .eq("id", delivery.id)
      result.areaStale += 1
      continue
    }

    const nextAttempt = delivery.attempts + 1
    const { data: claimed, error: claimError } = await supabase
      .from("planning_area_alert_deliveries")
      .update({ attempts: nextAttempt, last_error: null })
      .eq("id", delivery.id)
      .eq("attempts", delivery.attempts)
      .is("sent_at", null)
      .select("id")
      .maybeSingle()
    if (claimError) {
      result.areaFailed += 1
      continue
    }
    if (!claimed) continue

    try {
      const { data: userData, error: userError } = await supabase.auth.admin.getUserById(subscription.user_id)
      if (userError) throw new Error(`Could not load area alert recipient: ${userError.message}`)
      const recipient = userData.user?.email?.trim()
      if (!recipient) throw new Error("Area alert recipient has no email address")

      const emailDelivery: PlanningAreaAlertEmailDelivery = {
        delivery_id: delivery.id,
        subscription_id: delivery.subscription_id,
        event_type: event.event_type,
        event_date: event.event_date,
        event_label: event.label,
        distance_m: delivery.distance_m,
        area_label: subscription.label,
        area_radius_m: subscription.radius_m,
        area_category: subscription.category,
        area_trigger: subscription.event_trigger,
        local_authority_code: application.local_authority_code,
        application_reference: application.reference,
        proposal: application.proposal,
        location: application.location,
      }
      const providerMessageId = await sendPlanningAreaAlertEmail(emailDelivery, recipient)
      const { error: completeError } = await supabase
        .from("planning_area_alert_deliveries")
        .update({
          sent_at: new Date().toISOString(),
          provider_message_id: providerMessageId,
          last_error: null,
        })
        .eq("id", delivery.id)
      if (completeError) throw new Error(`Could not record area alert delivery: ${completeError.message}`)
      result.areaSent += 1
    } catch (deliveryError) {
      result.areaFailed += 1
      await supabase
        .from("planning_area_alert_deliveries")
        .update({ last_error: deliveryError instanceof Error ? deliveryError.message : String(deliveryError) })
        .eq("id", delivery.id)
      console.error(`Planning area alert delivery ${delivery.id} failed.`, deliveryError)
    }
  }

  return result
}

export async function runPlanningAreaAlertDelivery(
  supabase = getServiceRoleSupabase()
) {
  const { data, error } = await supabase
    .from("planning_area_alert_subscriptions")
    .select("id,user_id,source_application_id,label,center_lat,center_lng,radius_m,category,event_trigger,enabled,created_at,updated_at")
    .eq("enabled", true)
    .order("created_at", { ascending: true })
    .limit(MAX_SUBSCRIPTIONS_PER_RUN)
  if (error) throw new Error(`Area subscription lookup failed: ${error.message}`)

  let areaQueued = 0
  let areaQueueFailed = 0
  for (const subscription of (data ?? []) as PlanningAreaAlertSubscription[]) {
    if (areaQueued >= MAX_QUEUE_ROWS_PER_RUN) break
    try {
      areaQueued += await queueForSubscription(
        supabase,
        subscription,
        MAX_QUEUE_ROWS_PER_RUN - areaQueued
      )
    } catch (queueError) {
      areaQueueFailed += 1
      console.error(`Planning area alert queue failed for ${subscription.id}.`, queueError)
    }
  }

  return {
    areaSubscriptions: data?.length ?? 0,
    areaQueued,
    areaQueueFailed,
    ...(await sendPendingAreaDeliveries(supabase)),
  }
}
