import type { PlanningResultRecord } from "@/components/planning/PlanningApplicationResult"
import { getPlanningAuthorityByCode } from "@/lib/planning-authorities"
import type { PlanningApplication } from "@/lib/planning"
import { planningProposalTitle } from "@/lib/planning-presentation"
import { planningStatusLabel } from "@/lib/planning-status"
import { planningApplicationPath, planningGridToWgs84 } from "@/lib/property-intelligence"

export function planningResultRecord(application: PlanningApplication): PlanningResultRecord {
  const authority = getPlanningAuthorityByCode(application.local_authority_code)

  return {
    id: application.id,
    reference: application.reference,
    registrationDate: application.registration_date,
    decisionDate: application.decision_date,
    status: planningStatusLabel(application.normalized_status),
    proposal: planningProposalTitle(application.proposal, "No proposal text recorded"),
    authority: application.local_authority,
    location: application.location,
    applicant: application.applicant_name,
    applicationType: application.application_type,
    decision: application.decision_text,
    latestEvent: latestPlanningLifecycleEvent(application),
    detailHref: authority ? planningApplicationPath(authority, application.reference) : null,
    coordinates: planningGridToWgs84(application),
  }
}

function latestPlanningLifecycleEvent(
  application: PlanningApplication
): PlanningResultRecord["latestEvent"] {
  type LifecycleEvent = NonNullable<PlanningResultRecord["latestEvent"]>

  const events: Array<LifecycleEvent | null> = [
    application.appeal_decision_date
      ? { label: "Appeal decision", date: application.appeal_decision_date, detail: null }
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
          detail: application.decision_text,
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
