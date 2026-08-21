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

export function PlanningTimeline({
  events,
  decisionDue,
}: {
  events: PlanningEvent[]
  decisionDue?: DecisionDueMilestone | null
}) {
  const visibleEvents = preparePublicPlanningTimelineEvents(events)
  if (visibleEvents.length === 0 && !decisionDue) return null
  const hasConstructionInformation = visibleEvents.some(isConstructionPlanningEvent)
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
          ? "Key dated milestones from planning and official building-control records."
          : "Key dated milestones from the planning record."}
      </p>

      <ol className="mt-6 space-y-0">
        {visibleEvents.map((event) => {
          const isImportant = isImportantOutcome(event)
          const showPlanningGap = event.event_key === firstConstructionEventKey
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
