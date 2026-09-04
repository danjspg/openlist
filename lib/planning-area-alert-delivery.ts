import type { SupabaseClient } from "@supabase/supabase-js"
import {
  notableCategoriesMatchAreaAlert,
  type PlanningAreaAlertSubscription,
} from "@/lib/planning-area-alerts"
import {
  sendPlanningAreaAlertEmail,
  type PlanningAreaAlertEmailDelivery,
} from "@/lib/planning-area-alert-email"
import { planningDecisionTone } from "@/lib/planning-state-presentation"
import { getServiceRoleSupabase } from "@/lib/supabase"

const MAX_SUBSCRIPTIONS_PER_RUN = 50
const MAX_RADIUS_RESULTS = 250
const MAX_EVENTS_PER_SUBSCRIPTION = 500
const MAX_QUEUE_ROWS_PER_RUN = 250
const MAX_DELIVERIES_PER_RUN = 20

type RadiusRow = { application_id: string; distance_m: number | string }
type AreaEvent = {
  id: string
  application_id: string
  event_type: string
  event_date: string
  detected_at: string
  label: string
  new_value: string | null
}
type NotableRow = { application_id: string; notable_categories: string[] | null }
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

function eventTypesForTrigger(trigger: string) {
  switch (trigger) {
    case "approved": return ["decision_made", "decision_changed", "final_grant"]
    case "appealed": return ["appeal_lodged"]
    case "construction": return ["works_commenced"]
    default: return ["application_received"]
  }
}

function eventMatchesTrigger(event: AreaEvent, trigger: string) {
  if (trigger !== "approved") return eventTypesForTrigger(trigger).includes(event.event_type)
  if (event.event_type === "final_grant") return true
  return planningDecisionTone(event.new_value || event.label) === "positive"
}

async function queueForSubscription(
  supabase: SupabaseClient,
  subscription: PlanningAreaAlertSubscription,
  remainingCapacity: number
) {
  if (remainingCapacity <= 0) return 0
  const { data: radiusData, error: radiusError } = await supabase.rpc(
    "openlist_planning_applications_within_radius",
    {
      p_lat: subscription.center_lat,
      p_lng: subscription.center_lng,
      p_radius_m: subscription.radius_m,
      p_limit: MAX_RADIUS_RESULTS,
    }
  )
  if (radiusError) throw new Error(`Area radius lookup failed: ${radiusError.message}`)

  const distances = new Map<string, number>()
  for (const row of (radiusData ?? []) as RadiusRow[]) {
    const distance = Number(row.distance_m)
    if (row.application_id && Number.isFinite(distance)) distances.set(row.application_id, distance)
  }
  const applicationIds = [...distances.keys()]
  if (applicationIds.length === 0) return 0

  const eventTypes = eventTypesForTrigger(subscription.event_trigger)
  const baselineDate = subscription.created_at.slice(0, 10)
  const { data: eventData, error: eventError } = await supabase
    .from("planning_application_events")
    .select("id,application_id,event_type,event_date,detected_at,label,new_value")
    .in("application_id", applicationIds)
    .in("event_type", eventTypes)
    .gt("detected_at", subscription.created_at)
    .gte("event_date", baselineDate)
    .order("detected_at", { ascending: true })
    .limit(MAX_EVENTS_PER_SUBSCRIPTION)
  if (eventError) throw new Error(`Area event lookup failed: ${eventError.message}`)

  const events = ((eventData ?? []) as AreaEvent[])
    .filter((event) => eventMatchesTrigger(event, subscription.event_trigger))
  if (events.length === 0) return 0

  let notableByApplication = new Map<string, string[] | null>()
  if (subscription.category !== "all") {
    const ids = [...new Set(events.map((event) => event.application_id))]
    const { data: notableData, error: notableError } = await supabase
      .from("planning_seo_notable")
      .select("application_id,notable_categories")
      .in("application_id", ids)
    if (notableError) throw new Error(`Area category lookup failed: ${notableError.message}`)
    notableByApplication = new Map(
      ((notableData ?? []) as NotableRow[]).map((row) => [row.application_id, row.notable_categories])
    )
  }

  const queueRows = events
    .filter((event) => notableCategoriesMatchAreaAlert(
      subscription.category,
      notableByApplication.get(event.application_id)
    ))
    .slice(0, remainingCapacity)
    .map((event) => ({
      subscription_id: subscription.id,
      application_id: event.application_id,
      event_id: event.id,
      distance_m: distances.get(event.application_id) ?? 0,
    }))
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
