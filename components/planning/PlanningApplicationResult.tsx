import Link from "next/link"
import {
  planningSemanticState,
  planningStateBadgeClasses,
} from "@/lib/planning-state-presentation"
import { constructionStatusLabel } from "@/lib/building-control"

export type PlanningResultLifecycleEvent = {
  label: string
  date: string
  detail: string | null
}

export type PlanningResultRecord = {
  id: string
  reference: string
  registrationDate: string | null
  decisionDate: string | null
  status: string | null
  normalizedStatus: string
  proposal: string | null
  authority: string
  location: string | null
  applicant: string | null
  applicationType: string | null
  decision: string | null
  latestEvent: PlanningResultLifecycleEvent | null
  detailHref: string | null
  coordinates: { lat: number; lng: number } | null
  constructionStatus?: "commenced" | "completed" | null
}

export function PlanningApplicationList({
  applications,
  dateLabel = "Registered",
}: {
  applications: PlanningResultRecord[]
  dateLabel?: "Registered" | "Decision"
}) {
  return (
    <div className="space-y-3 py-4">
      {applications.map((application) => {
        const displayDate = dateLabel === "Decision" ? application.decisionDate : application.registrationDate
        const primaryTitle = application.location || application.proposal || "Planning application"
        const showProposal = Boolean(application.proposal && application.proposal !== primaryTitle)
        const state = planningSemanticState({
          normalizedStatus: application.normalizedStatus,
          statusLabel: application.status,
          decision: application.decision,
        })

        return (
          <article key={application.id} className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm transition hover:border-stone-300 sm:p-5">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-5">
              <div className="min-w-0">
                <h3 className="line-clamp-2 text-xl font-semibold leading-7 tracking-tight text-stone-950">
                  {application.detailHref ? (
                    <Link prefetch={false} className="transition hover:text-emerald-800" href={application.detailHref}>{primaryTitle}</Link>
                  ) : primaryTitle}
                </h3>
                <p className="mt-1.5 text-xs leading-5 text-stone-500">
                  <span className="font-semibold text-stone-600">{application.authority}</span>
                  <span aria-hidden="true" className="mx-1.5 text-stone-300">·</span>
                  <span className="font-mono">{application.reference}</span>
                  <span aria-hidden="true" className="mx-1.5 text-stone-300">·</span>
                  {dateLabel} {formatDate(displayDate)}
                </p>
              </div>
              {state || application.constructionStatus ? (
                <div className="flex shrink-0 flex-wrap gap-2 sm:max-w-56 sm:justify-end">
                  {state ? (
                  <p className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${planningStateBadgeClasses(state.tone)}`}>
                    {state.label}
                  </p>
                  ) : null}
                  {application.constructionStatus ? (
                    <p className="inline-flex rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-xs font-semibold text-sky-900">
                      {constructionStatusLabel(application.constructionStatus)}
                    </p>
                  ) : null}
                </div>
              ) : null}
            </div>

            {showProposal ? <p className="mt-3 line-clamp-2 text-sm leading-6 text-stone-600">{application.proposal}</p> : null}

            {application.latestEvent ? (
              <div className="mt-4 rounded-xl bg-stone-50 px-3.5 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-stone-400">Latest activity</p>
                <p className="mt-1 text-sm font-semibold leading-5 text-stone-800">
                  {application.latestEvent.label}
                  <span className="font-normal text-stone-500"> · {formatDate(application.latestEvent.date)}</span>
                </p>
                {application.latestEvent.detail && !state?.promotedDecision ? (
                  <p className="mt-1 line-clamp-2 text-xs leading-5 text-stone-500">{application.latestEvent.detail}</p>
                ) : null}
              </div>
            ) : null}

            {application.applicationType || application.applicant || (application.decision && application.latestEvent?.label !== "Decision" && !state?.promotedDecision) ? (
              <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs leading-5 text-stone-400">
                {application.applicationType ? <span>{application.applicationType}</span> : null}
                {application.applicant ? <span>Applicant: {application.applicant}</span> : null}
                {application.decision && application.latestEvent?.label !== "Decision" && !state?.promotedDecision ? <span>Decision: {application.decision}</span> : null}
              </div>
            ) : null}

            {application.detailHref ? (
              <Link prefetch={false} href={application.detailHref} className="mt-4 inline-flex min-h-10 items-center text-sm font-semibold text-emerald-800 transition hover:text-emerald-950">
                View application <span aria-hidden="true" className="ml-1">→</span>
              </Link>
            ) : null}
          </article>
        )
      })}
    </div>
  )
}

function formatDate(value: string | null) {
  if (!value) return "Not recorded"
  const date = new Date(`${value}T00:00:00`)
  if (Number.isNaN(date.getTime())) return "Not recorded"
  return new Intl.DateTimeFormat("en-IE", { day: "numeric", month: "short", year: "numeric" }).format(date)
}
