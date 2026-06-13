import type { Metadata } from "next"
import Link from "next/link"
import { connection } from "next/server"
import {
  formatPlanningDate,
  formatPlanningMonth,
  getPlanningDashboard,
  normalisePlanningSearchParams,
  type PlanningApplication,
  type PlanningCountStat,
  type PlanningSearchParams,
} from "@/lib/planning"

export const revalidate = 21600

export const metadata: Metadata = {
  title: "Search Planning Applications Cork | OpenList",
  description:
    "Search three years of Cork County planning applications and explore public metadata by area, status and application type.",
  alternates: {
    canonical: "/planning/applications",
  },
  robots: {
    index: true,
    follow: true,
  },
}

export default async function PlanningPage({
  searchParams,
}: {
  searchParams?: Promise<PlanningSearchParams>
}) {
  const rawSearchParams = await (searchParams || Promise.resolve({}))
  const filters = normalisePlanningSearchParams(rawSearchParams)
  const hasActiveSearch = Boolean(
    filters.q || filters.area || filters.status || filters.type
  )

  if (hasActiveSearch) {
    await connection()
  }

  const dashboard = await getPlanningDashboard(filters)
  const resultRows = hasActiveSearch
    ? dashboard.searchResults
    : dashboard.recentApplications
  const mostCommonType = dashboard.typeStats[0]
  const latestMonthLabel = dashboard.latestRegistrationMonth
    ? formatPlanningMonth(dashboard.latestRegistrationMonth)
    : "latest month"

  return (
    <main className="bg-stone-50">
      <section className="border-b border-stone-200 bg-white">
        <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 lg:py-16">
          <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <Link
              href="/planning"
              className="text-sm font-semibold text-stone-600 transition hover:text-stone-950"
            >
              Back to planning tools
            </Link>
            <Link
              href="/planning/commencements"
              className="text-sm font-semibold text-stone-600 transition hover:text-stone-950"
            >
              View building commencements
            </Link>
          </div>

          <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-end">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-stone-500">
                Public planning metadata
              </p>
              <h1 className="mt-4 max-w-3xl text-4xl font-semibold tracking-tight text-stone-950 sm:text-5xl">
                Cork County planning applications
              </h1>
              <p className="mt-5 max-w-2xl text-lg leading-8 text-stone-600">
                Search three years of Cork County Council planning applications
                and scan public metadata by area, application type and current
                status.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <Metric label="Applications" value={dashboard.totalCount} />
              <Metric
                label="Latest registered"
                value={formatPlanningDate(dashboard.latestRegistrationDate)}
              />
              <Metric
                label="Most active area"
                value={dashboard.activeArea?.label ?? "Not recorded"}
              />
              <Metric
                label="Most common type"
                value={mostCommonType?.label ?? "Not recorded"}
              />
              <Metric label="Latest month apps" value={dashboard.latestMonthCount} />
              <Metric
                label="Month change"
                value={formatSignedNumber(dashboard.latestMonthChange)}
              />
            </div>
          </div>

          <form
            action="/planning/applications"
            className="mt-10 grid gap-3 rounded-lg border border-stone-200 bg-stone-50 p-3 shadow-sm sm:grid-cols-[minmax(0,1.5fr)_minmax(150px,0.8fr)_minmax(150px,0.8fr)_minmax(150px,0.8fr)_auto]"
          >
            <input
              id="planning-search"
              name="q"
              type="search"
              aria-label="Search planning applications"
              defaultValue={filters.q}
              placeholder="Reference, location, applicant or proposal"
              className="min-h-12 rounded-md border border-stone-200 bg-white px-4 text-base text-stone-900 outline-none transition placeholder:text-stone-400 focus:border-stone-900"
            />

            <SelectFilter
              label="Area"
              name="area"
              value={filters.area}
              options={dashboard.areaOptions}
            />
            <SelectFilter
              label="Status"
              name="status"
              value={filters.status}
              options={dashboard.statusOptions}
            />
            <SelectFilter
              label="Type"
              name="type"
              value={filters.type}
              options={dashboard.typeOptions}
            />

            <div className="flex flex-col gap-2 sm:flex-row">
              <button
                type="submit"
                className="min-h-12 rounded-md bg-stone-950 px-5 text-base font-semibold text-white transition hover:bg-stone-700"
              >
                Search
              </button>
              {hasActiveSearch ? (
                <Link
                  href="/planning/applications"
                  className="inline-flex min-h-12 items-center justify-center rounded-md border border-stone-300 bg-white px-5 text-base font-semibold text-stone-700 transition hover:border-stone-900 hover:text-stone-950"
                >
                  Clear
                </Link>
              ) : null}
            </div>
          </form>
        </div>
      </section>

      <section className="mx-auto grid max-w-6xl gap-6 px-4 py-8 sm:px-6 lg:grid-cols-[minmax(0,1fr)_360px] lg:py-10">
        <div className="min-w-0 space-y-6">
          <div className="rounded-lg border border-stone-200 bg-white p-5 shadow-sm">
            <div className="flex flex-col gap-3 border-b border-stone-200 pb-4 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h2 className="text-2xl font-semibold tracking-tight text-stone-950">
                  {hasActiveSearch ? "Matching applications" : "Recent applications"}
                </h2>
                <p className="mt-1 text-sm text-stone-500">
                  {hasActiveSearch
                    ? `${dashboard.searchCount} public records match the selected filters.`
                    : "Latest registrations from Cork County Council."}
                </p>
              </div>
              {hasActiveSearch ? (
                <Link
                  href="/planning/applications"
                  className="self-start text-sm font-semibold text-stone-700 transition hover:text-stone-950"
                >
                  Clear filters
                </Link>
              ) : null}
            </div>

            <ApplicationsList applications={resultRows} />
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <BarList
              title="Applications by area"
              subtitle="Top Cork County localities in the imported three years."
              stats={dashboard.areaStats}
              linkForStat={(stat) => planningFilterHref(filters, "area", stat.label)}
            />
            <BarList
              title="Monthly registrations"
              subtitle="Recent application volume by registration month."
              stats={dashboard.monthStats.map((stat) => ({
                ...stat,
                label: formatPlanningMonth(stat.label),
              }))}
            />
          </div>

          <div className="grid gap-6 lg:grid-cols-3">
            <BarList
              title={`Areas in ${latestMonthLabel}`}
              subtitle="Localities with the most applications in the latest registration month."
              stats={dashboard.latestMonthAreaStats}
              linkForStat={(stat) => planningFilterHref(filters, "area", stat.label)}
            />
            <BarList
              title={`Status in ${latestMonthLabel}`}
              subtitle="Current status mix for applications registered in the latest month."
              stats={dashboard.latestMonthStatusStats}
              linkForStat={(stat) => planningFilterHref(filters, "status", stat.label)}
            />
            <BarList
              title={`Types in ${latestMonthLabel}`}
              subtitle="Most common application types registered in the latest month."
              stats={dashboard.latestMonthTypeStats}
              linkForStat={(stat) => planningFilterHref(filters, "type", stat.label)}
            />
          </div>
        </div>

        <aside className="min-w-0 space-y-6">
          <div className="rounded-lg border border-stone-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-semibold tracking-tight text-stone-950">
              Dataset notes
            </h2>
            <div className="mt-4 space-y-4 text-sm leading-6 text-stone-600">
              <p>
                This view uses public Cork County Council planning application
                metadata imported into OpenList. It excludes linked application
                documents and files.
              </p>
              <p>
                Records are shown as published by the council source. Always
                check the official application record before making decisions.
              </p>
            </div>
          </div>

          <div className="rounded-lg border border-stone-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-semibold tracking-tight text-stone-950">
              Related planning tool
            </h2>
            <p className="mt-2 text-sm leading-6 text-stone-600">
              Building commencements show monthly residential notices and unit
              counts from the BCMS public dataset.
            </p>
            <Link
              href="/planning/commencements"
              className="mt-4 inline-flex text-sm font-semibold text-stone-700 transition hover:text-stone-950"
            >
              View building commencements
            </Link>
          </div>

          <InsightCard
            title="Most common application type"
            value={mostCommonType?.label ?? "Not recorded"}
            detail={
              mostCommonType
                ? `${mostCommonType.count} applications in this import.`
                : "No application types were available."
            }
          />

          <BarList
            title="Status mix"
            subtitle="Current public status labels from the source."
            stats={dashboard.statusStats}
            compact
            linkForStat={(stat) => planningFilterHref(filters, "status", stat.label)}
          />

          <BarList
            title="Application types"
            subtitle="Most frequent application type labels."
            stats={dashboard.typeStats}
            compact
            linkForStat={(stat) => planningFilterHref(filters, "type", stat.label)}
          />
        </aside>
      </section>
    </main>
  )
}

function planningFilterHref(
  filters: Required<PlanningSearchParams>,
  key: "area" | "status" | "type",
  value: string
) {
  const params = new URLSearchParams()

  for (const filterKey of ["q", "area", "status", "type"] as const) {
    const nextValue = filterKey === key ? value : filters[filterKey]
    if (nextValue) params.set(filterKey, nextValue)
  }

  const query = params.toString()
  return `/planning/applications${query ? `?${query}` : ""}`
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-stone-200 bg-stone-50 p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-500">
        {label}
      </p>
      <p className="mt-2 break-words text-2xl font-semibold tracking-tight text-stone-950">
        {value}
      </p>
    </div>
  )
}

function formatSignedNumber(value: number | null) {
  if (value === null) return "Not available"
  if (value > 0) return `+${value}`
  return String(value)
}

function SelectFilter({
  label,
  name,
  value,
  options,
}: {
  label: string
  name: string
  value: string
  options: string[]
}) {
  return (
    <select
      name={name}
      aria-label={label}
      defaultValue={value}
      className="min-h-12 min-w-0 rounded-md border border-stone-200 bg-white px-3 text-base text-stone-900 outline-none transition focus:border-stone-900"
    >
      <option value="">{label}</option>
      {options.map((option) => (
        <option key={option} value={option}>
          {option}
        </option>
      ))}
    </select>
  )
}

function ApplicationsList({
  applications,
}: {
  applications: PlanningApplication[]
}) {
  if (applications.length === 0) {
    return (
      <div className="py-12 text-center text-sm text-stone-500">
        No planning applications matched those filters.
      </div>
    )
  }

  return (
    <div className="divide-y divide-stone-200">
      {applications.map((application) => (
        <article
          key={application.id}
          className="grid gap-4 py-5 lg:grid-cols-[150px_minmax(0,1fr)]"
        >
          <div>
            <p className="font-mono text-sm font-semibold text-stone-950">
              {application.reference}
            </p>
            <p className="mt-2 text-sm text-stone-500">
              {formatPlanningDate(application.registration_date)}
            </p>
            {application.status ? (
              <p className="mt-3 inline-flex rounded-full border border-stone-200 px-3 py-1 text-xs font-semibold text-stone-600">
                Status: {application.status}
              </p>
            ) : null}
          </div>

          <div className="min-w-0">
            <h3 className="text-lg font-semibold leading-7 tracking-tight text-stone-950">
              {application.proposal || "No proposal text recorded"}
            </h3>
            <p className="mt-2 text-sm leading-6 text-stone-600">
              {application.location || "No location recorded"}
            </p>
            <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-sm text-stone-500">
              {application.applicant_name ? (
                <span>Applicant: {application.applicant_name}</span>
              ) : null}
              {application.application_type ? (
                <span>Application type: {application.application_type}</span>
              ) : null}
              {application.decision_text ? (
                <span>Decision: {application.decision_text}</span>
              ) : null}
            </div>
            {application.source_url ? (
              <a
                href={application.source_url}
                target="_blank"
                rel="noreferrer"
                className="mt-4 inline-flex text-sm font-semibold text-stone-700 transition hover:text-stone-950"
              >
                Open council record
              </a>
            ) : null}
          </div>
        </article>
      ))}
    </div>
  )
}

function BarList({
  title,
  subtitle,
  stats,
  compact = false,
  linkForStat,
}: {
  title: string
  subtitle: string
  stats: PlanningCountStat[]
  compact?: boolean
  linkForStat?: (stat: PlanningCountStat) => string
}) {
  const maxCount = Math.max(...stats.map((stat) => stat.count), 1)

  return (
    <div className="rounded-lg border border-stone-200 bg-white p-5 shadow-sm">
      <h2 className="text-lg font-semibold tracking-tight text-stone-950">
        {title}
      </h2>
      <p className="mt-1 text-sm leading-6 text-stone-500">{subtitle}</p>

      {stats.length > 0 ? (
        <div className={compact ? "mt-4 space-y-3" : "mt-5 space-y-4"}>
          {stats.map((stat) => (
            <div key={stat.label}>
              <div className="flex items-baseline justify-between gap-4 text-sm">
                <span className="min-w-0 truncate font-medium text-stone-800">
                  {stat.label}
                </span>
                {linkForStat ? (
                  <Link
                    href={linkForStat(stat)}
                    className="shrink-0 rounded-full border border-stone-200 bg-stone-50 px-2.5 py-1 font-semibold text-stone-950 transition hover:border-stone-400"
                  >
                    {stat.count}
                  </Link>
                ) : (
                  <span className="shrink-0 font-semibold text-stone-950">
                    {stat.count}
                  </span>
                )}
              </div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-stone-100">
                <div
                  className="h-full rounded-full bg-emerald-700"
                  style={{ width: `${Math.max(6, (stat.count / maxCount) * 100)}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-5 text-sm text-stone-500">No records available yet.</p>
      )}
    </div>
  )
}

function InsightCard({
  title,
  value,
  detail,
}: {
  title: string
  value: string
  detail: string
}) {
  return (
    <div className="rounded-lg border border-stone-200 bg-emerald-950 p-5 text-white shadow-sm">
      <p className="text-sm font-semibold uppercase tracking-[0.16em] text-emerald-100">
        {title}
      </p>
      <p className="mt-4 text-3xl font-semibold tracking-tight">{value}</p>
      <p className="mt-3 text-sm leading-6 text-emerald-50">{detail}</p>
    </div>
  )
}
