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
    <div className="divide-y divide-stone-200">
      {applications.map((application) => {
        const displayDate =
          dateLabel === "Decision" ? application.decisionDate : application.registrationDate

        return (
          <article
            key={application.id}
            className="grid gap-4 py-5 lg:grid-cols-[150px_minmax(0,1fr)]"
          >
            <div>
              <p className="font-mono text-sm font-semibold text-stone-950">
                {application.reference}
              </p>
              <p className="mt-2 text-sm text-stone-500">
                {dateLabel} {formatDate(displayDate)}
              </p>
              {application.status ? (
                <p className="mt-3 inline-flex rounded-full border border-stone-200 px-3 py-1 text-xs font-semibold text-stone-600">
                  Status: {application.status}
                </p>
              ) : null}
            </div>

            <div className="min-w-0">
              {application.latestEvent ? (
                <div className="mb-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5">
                  <p className="text-xs font-semibold uppercase tracking-[0.12em] text-emerald-800">
                    {application.latestEvent.label} · {formatDate(application.latestEvent.date)}
                  </p>
                  {application.latestEvent.detail ? (
                    <p className="mt-1 text-sm font-semibold text-emerald-950">
                      {application.latestEvent.detail}
                    </p>
                  ) : null}
                </div>
              ) : null}
              <h3 className="line-clamp-3 text-lg font-semibold leading-7 tracking-tight text-stone-950">
                {application.detailHref ? (
                  <Link className="transition hover:text-emerald-800" href={application.detailHref}>
                    {application.proposal || "No proposal text recorded"}
                  </Link>
                ) : (
                  application.proposal || "No proposal text recorded"
                )}
              </h3>
              <p className="mt-2 text-sm font-semibold text-stone-500">
                {application.authority}
              </p>
              <p className="mt-2 text-sm leading-6 text-stone-600">
                {application.location || "No location recorded"}
              </p>
              <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-sm text-stone-500">
                {application.applicant ? <span>Applicant: {application.applicant}</span> : null}
                {application.applicationType ? (
                  <span>Application type: {application.applicationType}</span>
                ) : null}
                {application.decision && application.latestEvent?.label !== "Decision" ? (
                  <span>Decision: {application.decision}</span>
                ) : null}
              </div>
              {application.detailHref ? (
                <Link
                  href={application.detailHref}
                  className="mt-4 inline-flex min-h-10 items-center text-sm font-semibold text-stone-700 transition hover:text-stone-950"
                >
                  View application details <span aria-hidden="true" className="ml-1">→</span>
                </Link>
              ) : null}
            </div>
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
  return new Intl.DateTimeFormat("en-IE", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date)
}
