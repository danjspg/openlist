import Link from "next/link"

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
  proposal: string | null
  authority: string
  location: string | null
  applicant: string | null
  applicationType: string | null
  decision: string | null
  latestEvent: PlanningResultLifecycleEvent | null
  detailHref: string | null
  coordinates: { lat: number; lng: number } | null
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
        const displayDate =
          dateLabel === "Decision" ? application.decisionDate : application.registrationDate
        const primaryTitle =
          application.location || application.proposal || "Planning application"
        const showProposal = Boolean(
          application.proposal && application.proposal !== primaryTitle
        )
        const hasFinalDecision = Boolean(
          application.decision && normaliseLabel(application.status) === "decision made"
        )
        const currentStatus = hasFinalDecision
          ? application.decision
          : application.status
        const statusClasses = hasFinalDecision
          ? getDecisionBadgeClasses(application.decision)
          : "border-emerald-200 bg-emerald-50 text-emerald-800"

        return (
          <article
            key={application.id}
            className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm sm:p-5"
          >
            <div className="flex flex-col gap-1.5 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4">
              <p className="flex min-w-0 flex-wrap items-baseline gap-x-2 text-sm">
                <span className="font-mono font-semibold text-emerald-800">
                  {application.reference}
                </span>
                <span aria-hidden="true" className="text-stone-300">·</span>
                <span className="font-semibold text-stone-700">
                  {application.authority}
                </span>
              </p>
              <p className="shrink-0 text-xs font-medium text-stone-500">
                {dateLabel} {formatDate(displayDate)}
              </p>
            </div>

            <h3 className="mt-3 line-clamp-2 text-xl font-semibold leading-7 tracking-tight text-stone-950">
              {application.detailHref ? (
                <Link
                  className="transition hover:text-emerald-800"
                  href={application.detailHref}
                >
                  {primaryTitle}
                </Link>
              ) : (
                primaryTitle
              )}
            </h3>

            {showProposal ? (
              <p className="mt-2 line-clamp-2 text-sm leading-6 text-stone-600">
                {application.proposal}
              </p>
            ) : null}

            {currentStatus || application.latestEvent ? (
              <div
                className={`mt-4 grid gap-3 border-y border-stone-100 py-3 ${
                  application.latestEvent ? "sm:grid-cols-2" : ""
                }`}
              >
                {currentStatus ? (
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-stone-500">
                      Current status
                    </p>
                    <p className={`mt-1.5 inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${statusClasses}`}>
                      {currentStatus}
                    </p>
                  </div>
                ) : null}

                {application.latestEvent ? (
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-stone-500">
                      Latest activity
                    </p>
                    <p className="mt-1.5 text-sm font-semibold leading-5 text-stone-800">
                      {application.latestEvent.label}
                      <span className="font-normal text-stone-500">
                        {" · "}{formatDate(application.latestEvent.date)}
                      </span>
                    </p>
                    {application.latestEvent.detail && !hasFinalDecision ? (
                      <p className="mt-1 line-clamp-2 text-xs leading-5 text-stone-500">
                        {application.latestEvent.detail}
                      </p>
                    ) : null}
                  </div>
                ) : null}
              </div>
            ) : null}

            {application.applicationType || application.applicant ||
            (application.decision && application.latestEvent?.label !== "Decision" && !hasFinalDecision) ? (
              <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-xs leading-5 text-stone-500">
                {application.applicationType ? (
                  <span>{application.applicationType}</span>
                ) : null}
                {application.applicant ? (
                  <span>Applicant: {application.applicant}</span>
                ) : null}
                {application.decision && application.latestEvent?.label !== "Decision" && !hasFinalDecision ? (
                  <span>Decision: {application.decision}</span>
                ) : null}
              </div>
            ) : null}

            {application.detailHref ? (
              <Link
                href={application.detailHref}
                className="mt-4 inline-flex min-h-11 w-full items-center justify-center rounded-full border border-emerald-700 bg-emerald-700 px-5 text-sm font-semibold text-white shadow-sm transition hover:border-emerald-800 hover:bg-emerald-800 sm:w-auto"
              >
                View application <span aria-hidden="true" className="ml-1.5">→</span>
              </Link>
            ) : null}
          </article>
        )
      })}
    </div>
  )
}

function normaliseLabel(value: string | null) {
  return value?.trim().toLowerCase() ?? ""
}

function getDecisionBadgeClasses(decision: string | null) {
  const normalised = normaliseLabel(decision)

  if (normalised.includes("refus")) {
    return "border-red-200 bg-red-50 text-red-800"
  }

  if (normalised.includes("grant")) {
    return "border-emerald-200 bg-emerald-50 text-emerald-800"
  }

  if (
    normalised.includes("withdraw") ||
    normalised.includes("invalid") ||
    normalised.includes("incomplete")
  ) {
    return "border-amber-200 bg-amber-50 text-amber-900"
  }

  return "border-stone-300 bg-stone-100 text-stone-800"
}

function formatDate(value: string | null) {
  if (!value) return "Not recorded"
  const date = new Date(`${value}T00:00:00`)
  if (Number.isNaN(date.getTime())) return "Not recorded"
  return new Intl.DateTimeFormat("en-IE", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date)
}
