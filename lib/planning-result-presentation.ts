import type { PlanningResultRecord } from "@/components/planning/PlanningApplicationResult"
import { getPlanningAuthorityByCode } from "@/lib/planning-authorities"
import type { PlanningApplication } from "@/lib/planning"
import { planningProposalTitle } from "@/lib/planning-presentation"
import { planningStatusLabel } from "@/lib/planning-status"
import { planningApplicationPath, planningGridToWgs84 } from "@/lib/property-intelligence"

export function planningResultRecord(application: PlanningApplication): PlanningResultRecord {
  const authority = getPlanningAuthorityByCode(application.local_authority_code)
  const councilDecision = planningResultDecision(application.decision_text)
  const appealDecision = planningResultDecision(application.appeal_decision_text)
  const decision = application.normalized_status === "appeal_decided"
    ? appealDecision
    : councilDecision

  return {
    id: application.id,
    reference: application.reference,
    registrationDate: application.registration_date,
    decisionDate: application.normalized_status === "appeal_decided"
      ? application.appeal_decision_date
      : application.decision_date,
    status: planningStatusLabel(application.normalized_status),
    normalizedStatus: application.normalized_status,
    proposal: planningProposalTitle(application.proposal, "No proposal text recorded"),
    authority: application.local_authority,
    location: planningResultLocation(application.location),
    applicant: application.applicant_name,
    applicationType: planningResultApplicationType(application.application_type),
    decision,
    latestEvent: latestPlanningLifecycleEvent(application, councilDecision, appealDecision),
    detailHref: authority ? planningApplicationPath(authority, application.reference) : null,
    coordinates: planningGridToWgs84(application),
    constructionStatus: application.construction_status ?? null,
  }
}

export function planningResultLocation(value: string | null) {
  if (!value) return null
  const cleaned = value
    .replace(/\s+([,.;:])/g, "$1")
    .replace(/[ \t]{2,}/g, " ")
    .trim()
  return cleaned || null
}

export function planningResultApplicationType(value: string | null) {
  const trimmed = value?.trim()
  if (!trimmed) return null

  if (trimmed === trimmed.toUpperCase() && /[A-Z]/.test(trimmed)) {
    if (/^[A-Z0-9/&.-]{2,4}$/.test(trimmed) && trimmed !== "PERMISSION") {
      return trimmed
    }

    return trimmed
      .toLocaleLowerCase("en-IE")
      .replace(/\b[a-z]/g, (letter) => letter.toLocaleUpperCase("en-IE"))
  }

  return trimmed
}

export function planningResultDecision(value: string | null) {
  const trimmed = value?.trim()
  if (!trimmed) return null

  if (/^(?:n\/?a|not recorded|not applicable|none|null|-)$/i.test(trimmed)) {
    return null
  }

  return trimmed
}

function latestPlanningLifecycleEvent(
  application: PlanningApplication,
  councilDecision: string | null,
  appealDecision: string | null
): PlanningResultRecord["latestEvent"] {
  type LifecycleEvent = NonNullable<PlanningResultRecord["latestEvent"]>

  const events: Array<LifecycleEvent | null> = [
    application.appeal_decision_date
      ? { label: "Appeal decision", date: application.appeal_decision_date, detail: appealDecision }
      : null,
    application.final_grant_date
      ? { label: "Final grant", date: application.final_grant_date, detail: null }
      : null,
    application.withdrawal_date
      ? { label: "Withdrawn", date: application.withdrawal_date, detail: null }
      : null,
    application.decision_date
      ? {
          label: "Decision",
          date: application.decision_date,
          detail: councilDecision,
        }
      : null,
    application.appeal_lodged_date
      ? { label: "Appeal lodged", date: application.appeal_lodged_date, detail: null }
      : null,
    application.further_information_received_date
      ? {
          label: "Further information received",
          date: application.further_information_received_date,
          detail: null,
        }
      : null,
    application.further_information_requested_date
      ? {
          label: "Further information requested",
          date: application.further_information_requested_date,
          detail: null,
        }
      : null,
  ]

  return (
    events
      .filter((event): event is LifecycleEvent => event !== null)
      .sort((left, right) => right.date.localeCompare(left.date))[0] ?? null
  )
}
