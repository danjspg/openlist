import { planningProposalSummary, planningProposalTitle, meaningfulPlanningValue } from "./planning-presentation"

export type HighInterestCandidate = {
  application_id: string
  local_authority_code: string
  reference: string
  clicks: number
  impressions: number
}

export type PlanningQaEvent = {
  event_type: string
  event_date: string
  source_field: string | null
}

export const LIFECYCLE_DATE_FIELDS = [
  "registration_date", "valid_date", "decision_due_date", "further_information_requested_date",
  "further_information_received_date", "decision_date", "final_grant_date", "withdrawal_date",
  "appeal_lodged_date", "appeal_decision_date", "expiry_date",
] as const

export type LifecycleField = (typeof LIFECYCLE_DATE_FIELDS)[number]

export function rankHighInterestCandidates(candidates: HighInterestCandidate[], limit = 20) {
  return [...candidates]
    .sort((left, right) => right.clicks - left.clicks || right.impressions - left.impressions ||
      left.local_authority_code.localeCompare(right.local_authority_code) || left.reference.localeCompare(right.reference))
    .slice(0, Math.max(0, limit))
}

export function proposalPresentationProblems(proposal: string | null | undefined) {
  const text = meaningfulPlanningValue(proposal)
  const title = planningProposalTitle(proposal)
  const summary = planningProposalSummary(proposal)
  const problems: string[] = []
  if (!text) problems.push("proposal is missing")
  if (!meaningfulPlanningValue(title) || title === "Planning application") problems.push("heading falls back to generic text")
  if (!meaningfulPlanningValue(summary) || summary === "Planning application details") problems.push("description falls back to generic text")
  if (/\b(?:and|or|with|to|for|of|the|including|comprising)\s*…?$/i.test(title)) problems.push("heading ends mid-clause")
  if (/\b(?:and|or|with|to|for|of|the|including|comprising)\s*…?$/i.test(summary)) problems.push("description ends mid-clause")
  return problems
}

export function timelineProblems(
  fields: Partial<Record<LifecycleField, string | null>>,
  events: PlanningQaEvent[]
) {
  const problems: string[] = []
  const registration = fields.registration_date
  for (const [field, value] of Object.entries(fields)) {
    if (value && registration && field !== "registration_date" && value < registration) {
      problems.push(`${field} precedes registration`)
    }
  }
  for (const event of events) {
    if (event.event_type === "decision_made" && event.source_field === "decision_due_date") {
      problems.push("decision due date created a Decision made event")
    }
  }
  return [...new Set(problems)]
}

export function classifyHighInterestQa({ repaired = false, warnings = [], failures = [] }: {
  repaired?: boolean
  warnings?: string[]
  failures?: string[]
}) {
  if (failures.length) return "FAIL" as const
  if (warnings.length) return "WARN" as const
  return repaired ? "REPAIRED" as const : "PASS" as const
}
