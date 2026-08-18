import {
  normalisePlanningStatus,
  planningStatusKey,
  planningStatusLabel,
  type PlanningStatus,
} from "@/lib/planning-status"

export type PlanningEventType =
  | "application_received"
  | "application_validated"
  | "further_information_requested"
  | "further_information_received"
  | "decision_made"
  | "decision_notice_issued"
  | "final_grant"
  | "appeal_lodged"
  | "appeal_notification"
  | "appeal_decided"
  | "withdrawn"
  | "status_changed"
  | "decision_changed"
  | "source_date_corrected"
  | "other"

export type PlanningEventProvenance = "reconstructed" | "observed"

export type PlanningEvent = {
  id?: string
  application_id?: string
  event_type: PlanningEventType
  event_date: string
  detected_at: string
  event_source: string
  source_field: string | null
  label: string
  old_value: string | null
  new_value: string | null
  raw_source_value: string | null
  provenance: PlanningEventProvenance
  event_key: string
}

export type PlanningEventApplication = {
  status?: string | null
  normalized_status?: PlanningStatus | null
  decision_text?: string | null
  registration_date?: string | null
  valid_date?: string | null
  decision_date?: string | null
  final_grant_date?: string | null
  appeal_lodged_date?: string | null
  appeal_decision_date?: string | null
  dispatch_date?: string | null
  appeal_notify_date?: string | null
}

type SourceMilestone = {
  field: keyof PlanningEventApplication
  type: PlanningEventType
  label: string
}

const SOURCE_MILESTONES: SourceMilestone[] = [
  { field: "registration_date", type: "application_received", label: "Application received" },
  { field: "valid_date", type: "application_validated", label: "Application validated" },
  { field: "decision_date", type: "decision_made", label: "Decision made" },
  { field: "dispatch_date", type: "decision_notice_issued", label: "Decision notice issued" },
  { field: "final_grant_date", type: "final_grant", label: "Final grant" },
  { field: "appeal_lodged_date", type: "appeal_lodged", label: "Appeal lodged" },
  { field: "appeal_notify_date", type: "appeal_notification", label: "Appeal notification recorded" },
  { field: "appeal_decision_date", type: "appeal_decided", label: "Appeal decided" },
]

const EVENT_ORDER = new Map(
  SOURCE_MILESTONES.map((milestone, index) => [milestone.type, index])
)

export function validPlanningEventDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const date = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
}

function decisionLabel(application: PlanningEventApplication) {
  const decision = cleanText(application.decision_text)
  return decision ? `Decision: ${decision}` : "Decision made"
}

function cleanText(value: unknown) {
  if (value === null || value === undefined) return null
  const text = String(value).replace(/\s+/g, " ").trim()
  return text || null
}

export function buildReconstructedPlanningEvents(
  application: PlanningEventApplication,
  detectedAt = new Date().toISOString()
) {
  const events = SOURCE_MILESTONES.flatMap((milestone) => {
    const value = application[milestone.field]
    if (!validPlanningEventDate(value)) return []
    const label = milestone.type === "decision_made" ? decisionLabel(application) : milestone.label
    return [{
      event_type: milestone.type,
      event_date: value,
      detected_at: detectedAt,
      event_source: `planning_applications.${milestone.field}`,
      source_field: milestone.field,
      label,
      old_value: null,
      new_value: milestone.type === "decision_made" ? cleanText(application.decision_text) : value,
      raw_source_value: milestone.type === "decision_made" ? cleanText(application.decision_text) : value,
      provenance: "reconstructed" as const,
      event_key: `source:${milestone.field}:${value}`,
    } satisfies PlanningEvent]
  })
  return sortPlanningEvents(events)
}

export function detectObservedPlanningEvents(
  previous: PlanningEventApplication,
  incoming: PlanningEventApplication,
  detectedAt: string
) {
  const eventDate = detectedAt.slice(0, 10)
  const events: PlanningEvent[] = []
  const specificTypes = new Set<PlanningEventType>()

  for (const milestone of SOURCE_MILESTONES) {
    const oldDate = previous[milestone.field]
    const newDate = incoming[milestone.field]
    if (oldDate === newDate || !validPlanningEventDate(newDate)) continue
    if (oldDate && validPlanningEventDate(oldDate)) {
      events.push({
        event_type: "source_date_corrected",
        event_date: eventDate,
        detected_at: detectedAt,
        event_source: "openlist_refresh",
        source_field: milestone.field,
        label: `${milestone.label} date updated`,
        old_value: oldDate,
        new_value: newDate,
        raw_source_value: newDate,
        provenance: "observed",
        event_key: `observed:${milestone.field}:${oldDate}:${newDate}:${eventDate}`,
      })
      continue
    }
    specificTypes.add(milestone.type)
    events.push({
      event_type: milestone.type,
      event_date: newDate,
      detected_at: detectedAt,
      event_source: "openlist_refresh",
      source_field: milestone.field,
      label: milestone.type === "decision_made" ? decisionLabel(incoming) : milestone.label,
      old_value: null,
      new_value: milestone.type === "decision_made" ? cleanText(incoming.decision_text) : newDate,
      raw_source_value: milestone.type === "decision_made" ? cleanText(incoming.decision_text) : newDate,
      provenance: "observed",
      event_key: `source:${milestone.field}:${newDate}`,
    })
  }

  const oldStatus = previous.normalized_status || normalisePlanningStatus(previous.status)
  const newStatus = incoming.normalized_status || normalisePlanningStatus(incoming.status)
  const statusHasSpecificMilestone =
    (newStatus === "final_grant" && specificTypes.has("final_grant")) ||
    (newStatus === "appeal_decided" && specificTypes.has("appeal_decided")) ||
    (newStatus === "decision_made" && specificTypes.has("decision_made"))
  if (oldStatus !== newStatus && !statusHasSpecificMilestone) {
    events.push({
      event_type: newStatus === "withdrawn" ? "withdrawn" : "status_changed",
      event_date: eventDate,
      detected_at: detectedAt,
      event_source: "openlist_refresh",
      source_field: "status",
      label:
        newStatus === "withdrawn"
          ? "Application withdrawn"
          : `Status changed to ${planningStatusLabel(newStatus)}`,
      old_value: oldStatus,
      new_value: newStatus,
      raw_source_value: cleanText(incoming.status),
      provenance: "observed",
      event_key: `observed:status:${oldStatus}:${newStatus}:${eventDate}`,
    })
  }

  const oldDecision = cleanText(previous.decision_text)
  const newDecision = cleanText(incoming.decision_text)
  if (
    planningStatusKey(oldDecision) !== planningStatusKey(newDecision) &&
    !specificTypes.has("decision_made")
  ) {
    events.push({
      event_type: "decision_changed",
      event_date: eventDate,
      detected_at: detectedAt,
      event_source: "openlist_refresh",
      source_field: "decision_text",
      label: newDecision ? `Decision updated: ${newDecision}` : "Decision updated",
      old_value: oldDecision,
      new_value: newDecision,
      raw_source_value: newDecision,
      provenance: "observed",
      event_key: `observed:decision:${planningStatusKey(oldDecision)}:${planningStatusKey(newDecision)}:${eventDate}`,
    })
  }

  return sortPlanningEvents(events)
}

export function sortPlanningEvents<T extends PlanningEvent>(events: T[]) {
  return [...events].sort((left, right) =>
    left.event_date.localeCompare(right.event_date) ||
    (EVENT_ORDER.get(left.event_type) ?? 99) - (EVENT_ORDER.get(right.event_type) ?? 99) ||
    left.detected_at.localeCompare(right.detected_at) ||
    left.event_key.localeCompare(right.event_key)
  )
}

export function resolvePlanningEventDateCorrections<T extends PlanningEvent>(events: T[]) {
  const correctionsByField = new Map<string, T[]>()
  for (const event of events) {
    if (
      event.event_type !== "source_date_corrected" ||
      !event.source_field ||
      !validPlanningEventDate(event.old_value) ||
      !validPlanningEventDate(event.new_value)
    ) {
      continue
    }
    const corrections = correctionsByField.get(event.source_field) || []
    corrections.push(event)
    correctionsByField.set(event.source_field, corrections)
  }

  const resolved = events.map((event) => {
    if (event.event_type === "source_date_corrected" || !event.source_field) return event
    let eventDate = event.event_date
    const corrections = [...(correctionsByField.get(event.source_field) || [])].sort(
      (left, right) =>
        left.detected_at.localeCompare(right.detected_at) ||
        left.event_key.localeCompare(right.event_key)
    )
    for (const correction of corrections) {
      if (eventDate === correction.old_value) eventDate = correction.new_value as string
    }
    return eventDate === event.event_date ? event : { ...event, event_date: eventDate }
  })

  return sortPlanningEvents(resolved)
}
