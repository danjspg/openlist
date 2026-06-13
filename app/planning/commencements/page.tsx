import type { Metadata } from "next"
import Link from "next/link"
import { redirect } from "next/navigation"
import { connection } from "next/server"
import {
  formatPlanningMonth,
  getPlanningCommencementsPage,
  normalisePlanningSearchParams,
  type PlanningCommencementSummary,
  type PlanningCountStat,
  type PlanningSearchParams,
} from "@/lib/planning"

export const revalidate = 21600

export const metadata: Metadata = {
  title: "Search Building Commencements Cork | OpenList",
  description:
    "Explore Cork building commencement trends by month, notices, housing units, apartments and residential commencement category.",
  alternates: {
    canonical: "/planning/commencements",
  },
  robots: {
    index: true,
    follow: true,
  },
}

export default async function PlanningCommencementsPage({
  searchParams,
}: {
  searchParams?: Promise<PlanningSearchParams>
}) {
  const rawSearchParams = await (searchParams || Promise.resolve({}))
  const filters = normalisePlanningSearchParams(rawSearchParams)
  if (filters.area) {
    redirect(cleanCommencementsHref(filters))
  }

  const hasActiveSearch = Boolean(filters.commencementMetric || filters.month)

  if (hasActiveSearch) {
    await connection()
  }

  const dashboard = await getPlanningCommencementsPage(filters)

  return (
    <main className="bg-stone-50">
      <section className="border-b border-stone-200 bg-white">
        <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 lg:py-16">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <Link
              href="/planning"
              className="text-sm font-semibold text-stone-600 transition hover:text-stone-950"
            >
              Back to planning tools
            </Link>
            <Link
              href="/planning/applications"
              className="text-sm font-semibold text-stone-600 transition hover:text-stone-950"
            >
              Search planning applications
            </Link>
          </div>

          <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-end">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-stone-500">
                Public commencement metadata
              </p>
              <h1 className="mt-4 max-w-3xl text-4xl font-semibold tracking-tight text-stone-950 sm:text-5xl">
                Cork County building commencements
              </h1>
              <p className="mt-5 max-w-2xl text-lg leading-8 text-stone-600">
                Explore monthly residential commencement notices, housing-unit
                counts, apartments and commencement categories from the public
                BCMS dataset for Cork County Council.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <Metric
                label="Latest month"
                value={
                  dashboard.latestMonth
                    ? formatPlanningMonth(dashboard.latestMonth)
                    : "Not recorded"
                }
              />
              <Metric label="Units commenced" value={dashboard.latestUnits} />
              <Metric label="Notices" value={dashboard.latestNotices} />
              <Metric label="YTD units" value={dashboard.yearToDateUnits} />
            </div>
          </div>

          <form
            action="/planning/commencements"
            className="mt-10 grid gap-3 rounded-lg border border-stone-200 bg-stone-50 p-3 shadow-sm sm:grid-cols-[minmax(150px,0.8fr)_minmax(150px,0.8fr)_auto]"
          >
            <select
              name="month"
              aria-label="Month"
              defaultValue={dashboard.selectedMonth}
              className="min-h-12 min-w-0 rounded-md border border-stone-200 bg-white px-3 text-base text-stone-900 outline-none transition focus:border-stone-900"
            >
              <option value="">Month</option>
              {dashboard.monthOptions.map((month) => (
                <option key={month} value={month}>
                  {formatPlanningMonth(month)}
                </option>
              ))}
            </select>

            <select
              name="commencementMetric"
              aria-label="Commencement metric"
              defaultValue={
                dashboard.selectedMetric === "All Units"
                  ? ""
                  : dashboard.selectedMetric
              }
              className="min-h-12 min-w-0 rounded-md border border-stone-200 bg-white px-3 text-base text-stone-900 outline-none transition focus:border-stone-900"
            >
              {dashboard.metricOptions.map((option) => (
                <option key={option.label} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>

            <div className="flex flex-col gap-2 sm:flex-row">
              <button
                type="submit"
                className="min-h-12 rounded-md bg-stone-950 px-5 text-base font-semibold text-white transition hover:bg-stone-700"
              >
                Search
              </button>
              {hasActiveSearch ? (
                <Link
                  href="/planning/commencements"
                  className="inline-flex min-h-12 items-center justify-center rounded-md border border-stone-300 bg-white px-5 text-base font-semibold text-stone-700 transition hover:border-stone-900 hover:text-stone-950"
                >
                  Clear
                </Link>
              ) : null}
            </div>
          </form>

          <p className="mt-3 text-sm leading-6 text-stone-500">
            Commencement data is currently available by month and category.
          </p>
        </div>
      </section>

      <section className="mx-auto grid max-w-6xl gap-6 px-4 py-8 sm:px-6 lg:grid-cols-[minmax(0,1fr)_360px] lg:py-10">
        <div className="min-w-0 space-y-6">
          <div className="rounded-lg border border-stone-200 bg-white p-5 shadow-sm">
            <div className="flex flex-col gap-3 border-b border-stone-200 pb-4 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h2 className="text-2xl font-semibold tracking-tight text-stone-950">
                  {hasActiveSearch ? "Matching commencements" : "Recent commencements"}
                </h2>
                <p className="mt-1 text-sm text-stone-500">
                  {dashboard.searchCount} month
                  {dashboard.searchCount === 1 ? "" : "s"} shown for{" "}
                  {dashboard.selectedMetricLabel.toLowerCase()}.
                </p>
              </div>
              {dashboard.sourceUrl ? (
                <a
                  href={dashboard.sourceUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="self-start text-sm font-semibold text-stone-700 transition hover:text-stone-950"
                >
                  Open source CSV
                </a>
              ) : null}
            </div>

            <CommencementsList
              commencements={dashboard.results}
              selectedMetric={dashboard.selectedMetric}
              selectedMetricLabel={dashboard.selectedMetricLabel}
              buildMetricHref={(metric) =>
                commencementMetricHref(dashboard.selectedMonth, metric)
              }
            />
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <BarList
              title="Recent units commenced"
              subtitle="Monthly Cork County residential units from the BCMS source."
              stats={dashboard.recentUnits}
            />
            <BarList
              title="Latest dwelling mix"
              subtitle="Unit split for the latest published month."
              stats={dashboard.typeBreakdown}
              linkForStat={(stat) =>
                commencementMetricHref(
                  dashboard.selectedMonth,
                  commencementMetricForLabel(stat.label)
                )
              }
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
                Commencements are monthly residential summary rows by local
                authority, metric and period. The dataset does not include
                application-level records or site-level detail.
              </p>
              <p>
                OpenList keeps this view bounded to recent published months and
                does not create individual commencement detail pages.
              </p>
            </div>
          </div>

          <InsightCard
            title="Selected metric"
            value={dashboard.selectedMetricLabel}
            detail="Change the metric filter to compare all units, notices, one-off homes, scheme units and apartments."
          />

          <div className="rounded-lg border border-stone-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-semibold tracking-tight text-stone-950">
              Related planning tool
            </h2>
            <p className="mt-2 text-sm leading-6 text-stone-600">
              Planning applications include searchable application metadata such
              as reference, location, proposal, applicant, status and type.
            </p>
            <Link
              href="/planning/applications"
              className="mt-4 inline-flex text-sm font-semibold text-stone-700 transition hover:text-stone-950"
            >
              Search planning applications
            </Link>
          </div>
        </aside>
      </section>
    </main>
  )
}

function commencementMetricHref(month: string, metric: string) {
  const params = new URLSearchParams()
  if (month) params.set("month", month)
  if (metric !== "All Units") params.set("commencementMetric", metric)

  const query = params.toString()
  return `/planning/commencements${query ? `?${query}` : ""}`
}

function cleanCommencementsHref(filters: Required<PlanningSearchParams>) {
  const params = new URLSearchParams()
  if (filters.month) params.set("month", filters.month)
  if (filters.commencementMetric) {
    params.set("commencementMetric", filters.commencementMetric)
  }

  const query = params.toString()
  return `/planning/commencements${query ? `?${query}` : ""}`
}

function commencementMetricForLabel(label: string) {
  if (label === "One-off homes") return "Oneoffs"
  if (label === "Scheme units") return "Scheme"
  if (label === "Apartments") return "Apartments"
  if (label === "Notices") return "Notices"
  return "All Units"
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

function CommencementsList({
  commencements,
  selectedMetric,
  selectedMetricLabel,
  buildMetricHref,
}: {
  commencements: PlanningCommencementSummary[]
  selectedMetric: string
  selectedMetricLabel: string
  buildMetricHref: (metric: string) => string
}) {
  if (commencements.length === 0) {
    return (
      <div className="py-12 text-center text-sm text-stone-500">
        No commencement months matched those filters.
      </div>
    )
  }

  return (
    <div className="divide-y divide-stone-200">
      {commencements.map((commencement) => (
        <article
          key={commencement.periodMonth}
          className="grid gap-4 py-5 lg:grid-cols-[150px_minmax(0,1fr)]"
        >
          <div>
            <p className="font-mono text-sm font-semibold text-stone-950">
              {formatPlanningMonth(commencement.periodMonth)}
            </p>
            <p className="mt-2 text-sm text-stone-500">
              {commencement.notices} notices
            </p>
            <p className="mt-3 inline-flex rounded-full border border-stone-200 bg-white px-3 py-1 text-xs font-semibold text-stone-600">
              {commencement.selectedValue} {selectedMetricLabel.toLowerCase()}
            </p>
          </div>

          <div className="min-w-0">
            <h3 className="text-lg font-semibold leading-7 tracking-tight text-stone-950">
              {commencement.selectedValue} {selectedMetricLabel.toLowerCase()} in
              Cork County
            </h3>
            <p className="mt-2 text-sm leading-6 text-stone-600">
              {commencement.units} total units and {commencement.notices} notices
              were recorded for this month in the public BCMS residential
              commencement dataset.
            </p>
            <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-sm text-stone-500">
              <CommencementMetricLink
                label="One-off homes"
                value={commencement.oneOffs}
                metric="Oneoffs"
                selectedMetric={selectedMetric}
                href={buildMetricHref("Oneoffs")}
              />
              <CommencementMetricLink
                label="Scheme units"
                value={commencement.scheme}
                metric="Scheme"
                selectedMetric={selectedMetric}
                href={buildMetricHref("Scheme")}
              />
              <CommencementMetricLink
                label="Apartments"
                value={commencement.apartments}
                metric="Apartments"
                selectedMetric={selectedMetric}
                href={buildMetricHref("Apartments")}
              />
            </div>
          </div>
        </article>
      ))}
    </div>
  )
}

function CommencementMetricLink({
  label,
  value,
  metric,
  selectedMetric,
  href,
}: {
  label: string
  value: number
  metric: string
  selectedMetric: string
  href: string
}) {
  const isSelected = metric === selectedMetric

  return (
    <Link
      href={href}
      className={`rounded-full border px-3 py-1 text-sm font-semibold transition ${
        isSelected
          ? "border-emerald-700 bg-emerald-50 text-emerald-900"
          : "border-stone-200 bg-white text-stone-700 hover:border-stone-400 hover:text-stone-950"
      }`}
    >
      {label}: {value}
    </Link>
  )
}

function BarList({
  title,
  subtitle,
  stats,
  linkForStat,
}: {
  title: string
  subtitle: string
  stats: PlanningCountStat[]
  linkForStat?: (stat: PlanningCountStat) => string
}) {
  const maxCount = Math.max(...stats.map((stat) => stat.count), 1)

  return (
    <div className="rounded-lg border border-stone-200 bg-white p-5 shadow-sm">
      <h2 className="text-lg font-semibold tracking-tight text-stone-950">
        {title}
      </h2>
      <p className="mt-1 text-sm leading-6 text-stone-500">{subtitle}</p>

      <div className="mt-5 space-y-4">
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
