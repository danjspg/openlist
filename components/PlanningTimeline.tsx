import React from "react"
import {
  preparePublicPlanningTimelineEvents,
  type PlanningEvent,
} from "@/lib/planning-events"
import { planningStatusLabel, type PlanningStatus } from "@/lib/planning-status"

export function PlanningTimeline({ events }: { events: PlanningEvent[] }) {
  const visibleEvents = preparePublicPlanningTimelineEvents(events)
  if (visibleEvents.length === 0) return null

  return (
    <section
      aria-labelledby="planning-timeline-heading"
      className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm sm:p-8"
    >
      <h2
        id="planning-timeline-heading"
        className="text-2xl font-semibold tracking-tight text-stone-950"
      >
        Planning timeline
      </h2>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-stone-600">
        Key dated milestones from the council record and later changes observed by OpenList.
      </p>

      <ol className="mt-6 space-y-0">
        {visibleEvents.map((event, index) => {
          const isImportant = isImportantOutcome(event)
          const detail = eventDetail(event)
          return (
            <li key={event.id || event.event_key} className="relative grid grid-cols-[18px_minmax(0,1fr)] gap-3 pb-5 last:pb-0">
              {index < visibleEvents.length - 1 ? (
                <span
                  aria-hidden="true"
                  className="absolute left-[8px] top-4 h-[calc(100%-2px)] w-px bg-stone-200"
                />
              ) : null}
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
                  {!isSourceBackedEvent(event) ? (
                    <>
                      <span aria-hidden="true">·</span>
                      <span>
                        {event.provenance === "observed"
                          ? "Observed by OpenList"
                          : "Council record"}
                      </span>
                    </>
                  ) : null}
                  {detail ? <span>· {detail}</span> : null}
                </div>
              </div>
            </li>
          )
        })}
      </ol>
    </section>
  )
}

function isSourceBackedEvent(event: PlanningEvent) {
  return Boolean(event.source_field) &&
    event.event_type !== "status_changed" &&
    event.event_type !== "decision_changed"
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

function eventDetail(event: PlanningEvent) {
  if (event.event_type === "status_changed" && event.old_value) {
    return `Previously ${planningStatusLabel(event.old_value as PlanningStatus)}`
  }
  if (event.event_type === "decision_changed" && event.old_value) {
    return `Previously ${event.old_value}`
  }
  if (
    event.event_type === "source_date_corrected" &&
    event.old_value &&
    event.new_value
  ) {
    return `${formatEventDate(event.old_value)} → ${formatEventDate(event.new_value)}`
  }
  return null
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
