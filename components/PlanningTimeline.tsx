import React from "react"
import {
  preparePublicPlanningTimelineEvents,
  isConstructionPlanningEvent,
  type PlanningEvent,
} from "@/lib/planning-events"

type DecisionDueMilestone = {
  date: string
  formattedDate: string
}

const ACP_EVENT_SOURCE = "an_coimisiun_pleanala_open_data"

export function PlanningTimeline({
  events,
  decisionDue,
}: {
  events: PlanningEvent[]
  decisionDue?: DecisionDueMilestone | null
}) {
  const visibleEvents = preferAuthoritativeAppealMilestones(
    preparePublicPlanningTimelineEvents(events)
  )
  if (visibleEvents.length === 0 && !decisionDue) return null
  const hasConstructionInformation = visibleEvents.some(isConstructionPlanningEvent)
  const hasAppealInformation = visibleEvents.some(isAcpAppealEvent)
  const hasPlanningOutcome = visibleEvents.some(isPlanningOutcomeEvent)
  const firstConstructionEventKey = hasConstructionInformation && !hasPlanningOutcome
    ? visibleEvents.find(isConstructionPlanningEvent)?.event_key ?? null
    : null

  return (
    <section
      aria-labelledby="planning-timeline-heading"
      className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm sm:p-8"
    >
      <h2
        id="planning-timeline-heading"
        className="text-2xl font-semibold tracking-tight text-stone-950"
      >
        {hasConstructionInformation ? "Planning and construction timeline" : "Planning timeline"}
      </h2>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-stone-600">
        {hasConstructionInformation
          ? "Key dated milestones from planning, appeal and official building-control records."
          : hasAppealInformation
            ? "Key dated milestones from the council planning record and An Coimisiún Pleanála appeal records."
            : "Key dated milestones from the planning record."}
      </p>

      <ol className="mt-6 space-y-0">
        {visibleEvents.map((event) => {
          const isImportant = isImportantOutcome(event)
          const showPlanningGap = event.event_key === firstConstructionEventKey
          const appealUrl = acpCaseUrl(event)
          return (
            <React.Fragment key={event.id || event.event_key}>
              {showPlanningGap ? (
                <li className="relative grid grid-cols-[18px_minmax(0,1fr)] gap-3 pb-5">
                  <span
                    aria-hidden="true"
                    className="absolute left-[8px] top-4 h-[calc(100%-2px)] w-px bg-stone-200"
                  />
                  <span
                    aria-hidden="true"
                    className="relative mt-1.5 h-[17px] w-[17px] rounded-full border-4 border-white bg-white ring-1 ring-stone-300"
                  />
                  <div className="min-w-0 rounded-xl border border-stone-200 bg-stone-50 px-4 py-3">
                    <p className="font-medium leading-6 text-stone-900">Planning outcome not available in OpenList</p>
                    <p className="mt-1 text-xs leading-5 text-stone-600">
                      OpenList&apos;s planning record does not contain a dated decision or grant milestone. Later official building-control records show construction activity.
                    </p>
                  </div>
                </li>
              ) : null}
              <li className="relative grid grid-cols-[18px_minmax(0,1fr)] gap-3 pb-5">
                <span
                  aria-hidden="true"
                  className="absolute left-[8px] top-4 h-[calc(100%-2px)] w-px bg-stone-200"
                />
                <span
                  aria-hidden="true"
                  className={`relative mt-1.5 h-[17px] w-[17px] rounded-full border-4 border-white ring-1 ${
                    isImportant
                      ? "bg-emerald-700 ring-emerald-700"
                      : "bg-stone-300 ring-stone-300"
                  }`}
                />
                <div className="min-w-0">
                  <p className={`${isImportant ? "font-semibold text-stone-950" : "font-medium text-stone-900"} leading-6`}>
                    {event.label}
                  </p>
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs leading-5 text-stone-500">
                    <time dateTime={event.event_date}>{formatEventDate(event.event_date)}</time>
                    {isConstructionPlanningEvent(event) ? (
                      <span>Official NBCO/BCMS data</span>
                    ) : isAcpAppealEvent(event) ? (
                      <span>Official An Coimisiún Pleanála data</span>
                    ) : null}
                    {appealUrl ? (
                      <a
                        href={appealUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="font-semibold text-emerald-800 underline decoration-emerald-300 underline-offset-2 hover:text-emerald-950"
                      >
                        View appeal case
                      </a>
                    ) : null}
                  </div>
                </div>
              </li>
            </React.Fragment>
          )
        })}

        {decisionDue ? (
          <li className="relative grid grid-cols-[18px_minmax(0,1fr)] gap-3">
            <span
              aria-hidden="true"
              className="relative mt-1.5 h-[17px] w-[17px] rounded-full border-4 border-white bg-white ring-2 ring-emerald-700"
            />
            <div className="min-w-0 rounded-xl border border-emerald-200 bg-emerald-50/60 px-4 py-3">
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-semibold leading-6 text-stone-950">Decision due</p>
                <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-emerald-800 ring-1 ring-emerald-200">
                  Target date
                </span>
              </div>
              <time
                dateTime={decisionDue.date}
                className="mt-1 block text-sm font-semibold text-emerald-900"
              >
                {decisionDue.formattedDate}
              </time>
              <p className="mt-1 text-xs leading-5 text-stone-600">
                Current decision target recorded by the council.
              </p>
            </div>
          </li>
        ) : null}
      </ol>
    </section>
  )
}

function preferAuthoritativeAppealMilestones(events: PlanningEvent[]) {
  const authoritativeKeys = new Set(
    events
      .filter(isAcpAppealEvent)
      .map((event) => `${event.event_type}:${event.event_date}`)
  )
  return events.filter((event) => {
    if (!["appeal_lodged", "appeal_decided"].includes(event.event_type)) return true
    const key = `${event.event_type}:${event.event_date}`
    return !authoritativeKeys.has(key) || isAcpAppealEvent(event)
  })
}

function isAcpAppealEvent(event: PlanningEvent) {
  return event.event_source === ACP_EVENT_SOURCE &&
    ["appeal_lodged", "appeal_decided"].includes(event.event_type)
}

function acpCaseUrl(event: PlanningEvent) {
  if (!isAcpAppealEvent(event)) return null
  const caseNumber = event.event_key.match(/^acp:([^:]+):/)?.[1]
  const numeric = caseNumber?.match(/\d{5,}/)?.[0]
  return numeric ? `https://www.pleanala.ie/en-ie/case/${numeric}` : null
}

function isImportantOutcome(event: PlanningEvent) {
  return [
    "decision_made",
    "decision_changed",
    "final_grant",
    "appeal_decided",
    "withdrawn",
  ].includes(event.event_type)
}

function isPlanningOutcomeEvent(event: PlanningEvent) {
  return [
    "decision_made",
    "final_grant",
    "appeal_decided",
    "withdrawn",
  ].includes(event.event_type)
}

function formatEventDate(value: string) {
  const date = new Date(`${value}T00:00:00`)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat("en-IE", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date)
}
