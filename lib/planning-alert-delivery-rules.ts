import type { PlanningEventType } from "@/lib/planning-events"

export const PLANNING_ALERT_EVENT_TYPES = [
  "further_information_requested",
  "further_information_received",
  "decision_made",
  "final_grant",
  "appeal_lodged",
  "appeal_decided",
  "withdrawn",
  "decision_changed",
  "decision_due_changed",
] as const satisfies readonly PlanningEventType[]

export const PLANNING_ALERT_STATUS_DESTINATIONS = [
  "under_assessment",
  "further_information_requested",
  "further_information_received",
  "decision_made",
  "final_grant",
  "appealed",
  "appeal_decided",
  "withdrawn",
  "invalid",
  "finalised",
] as const

export const PLANNING_ALERT_MAX_ATTEMPTS = 5
export const PLANNING_ALERT_QUEUE_BATCH_SIZE = 200
export const PLANNING_ALERT_DELIVERY_BATCH_SIZE = 25

export function planningAlertDeliveryIsEnabled() {
  return process.env.PLANNING_ALERT_DELIVERY_ENABLED === "true"
}

export function planningAlertEventTitle(eventType: string, label: string) {
  const titles: Record<string, string> = {
    further_information_requested: "Further information requested",
    further_information_received: "Further information received",
    decision_made: "A decision has been recorded",
    final_grant: "Final grant recorded",
    appeal_lodged: "An appeal has been lodged",
    appeal_decided: "The appeal has been decided",
    withdrawn: "The application has been withdrawn",
    decision_changed: "The decision has changed",
    decision_due_changed: "The decision due date has changed",
    status_changed: "The application status has changed",
  }

  return titles[eventType] || label || "Planning application updated"
}
