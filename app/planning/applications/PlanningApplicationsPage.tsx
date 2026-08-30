import type { Metadata } from "next"
import Link from "next/link"
import { PlanningCategoryLinks } from "@/components/planning/PlanningCategoryLinks"
import PlanningResultsView, {
  type PlanningResultRecord,
} from "@/components/planning/PlanningResultsView"
import SourceNote from "@/components/SourceNote"
import { type PlanningAuthority } from "@/lib/planning-authorities"
import {
  formatPlanningDate,
  formatPlanningMonth,
  getPlanningDashboard,
  normalisePlanningSearchParams,
  type PlanningCountStat,
  type PlanningSearchParams,
} from "@/lib/planning"
import { countyForPlanningAuthority } from "@/lib/property-intelligence"
import { planningResultRecord } from "@/lib/planning-result-presentation"
import {
  buildPlanningFilterFields,
  type PlanningFilterKey,
} from "@/lib/planning-filters"

export const revalidate = 21600

export const metadata: Metadata = {
  title: "Search Planning Applications Ireland | OpenList",
  description:
    "Search Irish planning applications across available official history by location, reference, development, applicant or status.",
  alternates: { canonical: "/planning" },
  robots: { index: true, follow: true },
}

export default function PlanningPage() {
  return <PlanningApplicationsView />
}

export async function PlanningApplicationsView({
  searchParams,
  authority,
  showCategoryLinks = false,
}: {
  searchParams?: Promise<PlanningSearchParams>
  authority?: PlanningAuthority
  showCategoryLinks?: boolean
}) {
  const rawSearchParams = await (searchParams || Promise.resolve({}))
  const filters = normalisePlanningSearchParams(rawSearchParams)
  const hasActiveSearch = Boolean(
    filters.q || filters.area || filters.council || filters.status || filters.type || filters.construction || filters.sort === "oldest"
  )
  const aggregateIntentionallySuppressed = Boolean(filters.status || filters.type || filters.construction)
  const dashboard = await getPlanningDashboard(filters, authority ?? null)
  const completedMonthStats = getCompletedPlanningMonthStats(dashboard.monthStats)
  const latestCompletedMonth = completedMonthStats.at(-1)
  const previousCompletedMonth = completedMonthStats.at(-2)
  const completedMonthChange = latestCompletedMonth && previousCompletedMonth
    ? latestCompletedMonth.count - previousCompletedMonth.count
    : null
  const resultRows = hasActiveSearch ? dashboard.searchResults : dashboard.recentApplications
  const planningResults: PlanningResultRecord[] = resultRows.map(planningResultRecord)
  const isCouncilScoped = Boolean(authority || filters.council)
  const planningPath = authority ? `/planning/${authority.slug}` : "/planning"
  const pageTitle = authority ? `${authority.shortName} planning applications` : "National planning applications"
  const pageDescription = authority
    ? `Search ${authority.name} planning applications by location, reference, development, applicant or status.`
    : "Search Irish planning applications by location, reference, development, applicant or status."
  const areaFilterLabel = authority ? "Area" : "Council"
  const areaFilterName = authority ? "area" : "council"
  const areaFilterValue = authority ? filters.area : filters.council
  const areaFilterKey: PlanningFilterKey = isCouncilScoped ? "area" : "council"
  const areaStatsTitle = isCouncilScoped ? "Most active areas" : "Most active councils"
  const quickStats = !hasActiveSearch
    ? (isCouncilScoped ? dashboard.areaStats : dashboard.councilActivityStats).slice(0, 5)
    : []
  const soldPriceCounty = authority ? countyForPlanningAuthority(authority.code) : null
  const currentMonthLabel = dashboard.latestRegistrationMonth
    ? formatPlanningMonth(dashboard.latestRegistrationMonth)
    : "current month"
  const latestCompletedMonthLabel = latestCompletedMonth
    ? formatPlanningMonth(latestCompletedMonth.label)
    : "Not available"

  return (
    <main className="bg-stone-50">
      <section className="border-b border-stone-200 bg-white">
        <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 lg:py-14">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-stone-500">
            Planning in Ireland
          </p>
          <h1 className="mt-3 max-w-4xl text-4xl font-semibold tracking-tight text-stone-950 sm:text-5xl">
            {pageTitle}
          </h1>
          <p className="mt-4 max-w-3xl text-lg leading-8 text-stone-600">{pageDescription}</p>
          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-stone-500">
            <span>Latest registered: {formatPlanningDate(dashboard.latestRegistrationDate)}</span>
            <span aria-hidden="true">·</span>
            <span>Source: {authority?.name ?? "Irish local authorities"}</span>
            {soldPriceCounty ? (
              <>
                <span aria-hidden="true">·</span>
                <Link href={`/sold-prices/${soldPriceCounty.toLowerCase()}`} className="font-semibold text-emerald-800 hover:text-emerald-950">
                  Sold prices in {soldPriceCounty}
                </Link>
              </>
            ) : null}
          </div>

          {showCategoryLinks && !authority && !hasActiveSearch ? <PlanningCategoryLinks embedded /> : null}

          <form action={planningPath} className="mt-8 rounded-2xl border border-stone-300 bg-stone-50 p-4 shadow-sm sm:p-5">
            <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(170px,0.28fr)_minmax(170px,0.28fr)_auto]">
              <input
                id="planning-search"
                name="q"
                type="search"
                aria-label="Search planning applications"
                defaultValue={filters.q}
                placeholder="Address, area, planning reference or development"
                className="min-h-14 rounded-lg border border-stone-300 bg-white px-4 text-base text-stone-900 outline-none transition placeholder:text-stone-400 focus:border-stone-900 focus:ring-2 focus:ring-stone-200"
              />
              <SelectFilter
                label={areaFilterLabel}
                name={areaFilterName}
                value={areaFilterValue}
                options={[...dashboard.areaOptions].sort((left, right) => left.localeCompare(right, "en-IE", { sensitivity: "base" }))}
              />
              <SelectFilter label="Status" name="status" value={filters.status} options={dashboard.statusOptions} />
              <button type="submit" className="min-h-14 rounded-lg bg-stone-950 px-6 text-base font-semibold text-white transition hover:bg-stone-700">
                Search
              </button>
            </div>

            <details className="mt-3 rounded-xl border border-stone-200 bg-white px-4 py-3" open={Boolean(filters.type || filters.construction || filters.sort === "oldest")}>
              <summary className="cursor-pointer text-sm font-semibold text-stone-700">More filters</summary>
              <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:max-w-2xl">
                <SelectFilter label="Type" name="type" value={filters.type} options={dashboard.typeOptions} />
                <SelectFilter
                  label="Sort by"
                  name="sort"
                  value={filters.sort}
                  options={[
                    { value: "newest", label: "Newest applications" },
                    { value: "oldest", label: "Oldest applications" },
                  ]}
                />
                <label className="flex min-h-14 items-center gap-3 rounded-lg border border-stone-300 bg-white px-4 text-sm font-semibold text-stone-800 sm:col-span-2 lg:col-span-1">
                  <input
                    type="checkbox"
                    name="construction"
                    value="commenced"
                    defaultChecked={filters.construction === "commenced"}
                    className="h-5 w-5 rounded border-stone-300 accent-emerald-800"
                  />
                  Construction commenced
                </label>
              </div>
            </details>

            {hasActiveSearch ? (
              <div className="mt-3 flex justify-end">
                <Link href={planningPath} className="text-sm font-semibold text-stone-600 hover:text-stone-950">Clear all filters</Link>
              </div>
            ) : null}
          </form>

          {!dashboard.aggregateAvailable && !aggregateIntentionallySuppressed ? (
            <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-950">
              Planning statistics are temporarily unavailable. Recent applications and search remain available.
            </p>
          ) : null}

          {quickStats.length > 0 ? (
            <nav className="mt-4 flex flex-wrap items-center gap-2" aria-label={areaStatsTitle}>
              <span className="mr-1 text-xs font-semibold uppercase tracking-[0.14em] text-stone-400">Explore</span>
              {quickStats.map((stat) => (
                <PlanningFilterButton
                  key={stat.label}
                  action={planningPath}
                  fields={buildPlanningFilterFields(filters, areaFilterKey, stat.label)}
                  className="inline-flex min-h-9 items-center rounded-full border border-stone-200 bg-white px-3 text-sm font-semibold text-stone-700 transition hover:border-stone-400 hover:text-stone-950"
                >
                  {stat.label}<span className="ml-2 font-normal text-stone-400">{formatPlanningCount(stat.count)}</span>
                </PlanningFilterButton>
              ))}
            </nav>
          ) : null}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:py-10">
        <section className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="flex flex-col gap-3 border-b border-stone-200 pb-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="text-2xl font-semibold tracking-tight text-stone-950">
                {hasActiveSearch ? "Matching applications" : "Recent applications"}
              </h2>
              <p className="mt-1 text-sm text-stone-500">
                {hasActiveSearch
                  ? `${formatPlanningCount(dashboard.searchCount)} ${dashboard.searchCount === 1 ? "application matches" : "applications match"} the selected filters.`
                  : authority
                    ? `Latest registrations from ${authority.name}.`
                    : "Latest registrations across available local authorities."}
              </p>
            </div>
            {hasActiveSearch ? <Link href={planningPath} className="text-sm font-semibold text-stone-600 hover:text-stone-950">Clear filters</Link> : null}
          </div>
          <PlanningResultsView applications={planningResults} />
        </section>

        {dashboard.aggregateAvailable ? (
          <section className="mt-8">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-400">Planning overview</p>
                <h2 className="mt-2 text-2xl font-semibold tracking-tight text-stone-950">Activity at a glance</h2>
              </div>
              <p className="max-w-2xl text-sm leading-6 text-stone-500">
                Historical totals are shown once below. Monthly registrations use completed calendar months; the compact current-month note is shown separately.
              </p>
            </div>

            <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Metric label="Applications" value={dashboard.totalCount} detail="Available recorded history" />
              <Metric label={areaStatsTitle} value={dashboard.activeArea?.label ?? "Not recorded"} detail={dashboard.activeArea ? `${formatPlanningCount(dashboard.activeArea.count)} applications` : "No area total available"} />
              <Metric label="Latest complete month" value={latestCompletedMonth?.count ?? "Not available"} detail={latestCompletedMonthLabel} />
              <Metric label="Month change" value={formatSignedNumber(completedMonthChange)} detail="Vs previous completed month" />
            </div>

            <div className="mt-4 rounded-xl border border-stone-200 bg-white px-4 py-3 text-sm text-stone-600">
              <span className="font-semibold text-stone-800">Current registration month: {currentMonthLabel}.</span>{" "}
              Current-month area, status and type breakdowns can be partial until the month closes.
            </div>

            <div className="mt-5 grid gap-5 lg:grid-cols-3">
              <BarList
                title={areaStatsTitle}
                subtitle={isCouncilScoped ? "Top localities across available recorded history." : "Council activity in a consistent national comparison window."}
                stats={dashboard.areaStats}
                filterForStat={(stat) => planningFilterSpec(planningPath, filters, areaFilterKey, stat.label)}
              />
              <BarList
                title="Monthly registrations"
                subtitle="Latest 12 completed registration months."
                stats={completedMonthStats.map((stat) => ({ ...stat, label: formatPlanningMonth(stat.label) }))}
              />
              <div className="space-y-5">
                <BarList
                  title="Status mix"
                  subtitle="Current status labels across available recorded history."
                  stats={dashboard.statusStats.slice(0, 5)}
                  compact
                  filterForStat={(stat) => planningFilterSpec(planningPath, filters, "status", stat.label)}
                />
                <BarList
                  title="Application types"
                  subtitle="Most common application types across available recorded history."
                  stats={dashboard.typeStats.slice(0, 5)}
                  compact
                  filterForStat={(stat) => planningFilterSpec(planningPath, filters, "type", stat.label)}
                />
              </div>
            </div>
          </section>
        ) : null}

        <div className="mt-8">
          <SourceNote compact>
            {authority
              ? `OpenList uses public ${authority.name} planning information. `
              : "OpenList uses public Irish local-authority planning information. "}
            Linked application documents are not reproduced here. Check the official application record before relying on a planning status, date or decision.
          </SourceNote>
        </div>
      </section>
    </main>
  )
}

function planningFilterSpec(
  basePath: string,
  filters: Required<PlanningSearchParams>,
  key: PlanningFilterKey,
  value: string
) {
  return { action: basePath, fields: buildPlanningFilterFields(filters, key, value) }
}

function Metric({ label, value, detail }: { label: string; value: string | number; detail: string }) {
  return (
    <div className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-stone-400">{label}</p>
      <p className="mt-3 min-w-0 break-words text-2xl font-semibold tracking-tight text-stone-950">
        {typeof value === "number" ? formatPlanningCount(value) : value}
      </p>
      <p className="mt-2 text-xs leading-5 text-stone-500">{detail}</p>
    </div>
  )
}

function getCompletedPlanningMonthStats(stats: PlanningCountStat[]) {
  const currentMonth = currentPlanningMonthKey()
  return stats.filter((stat) => stat.label < currentMonth).slice(-12)
}

function currentPlanningMonthKey() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`
}

function formatSignedNumber(value: number | null) {
  if (value === null) return "Not available"
  if (value > 0) return `+${formatPlanningCount(value)}`
  return formatPlanningCount(value)
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
  options: Array<string | { value: string; label: string }>
}) {
  return (
    <select
      name={name}
      aria-label={label}
      defaultValue={value}
      className="min-h-14 min-w-0 rounded-lg border border-stone-300 bg-white px-3 text-base text-stone-900 outline-none transition focus:border-stone-900"
    >
      <option value="">{label}</option>
      {options.map((option) => {
        const optionValue = typeof option === "string" ? option : option.value
        const optionLabel = typeof option === "string" ? option : option.label
        return <option key={optionValue} value={optionValue}>{optionLabel}</option>
      })}
    </select>
  )
}

function BarList({
  title,
  subtitle,
  stats,
  compact = false,
  filterForStat,
}: {
  title: string
  subtitle: string
  stats: PlanningCountStat[]
  compact?: boolean
  filterForStat?: (stat: PlanningCountStat) => PlanningFilterSpec
}) {
  const shownStats = stats.slice(0, compact ? 5 : 8)
  const maxCount = Math.max(...shownStats.map((stat) => stat.count), 1)
  return (
    <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
      <h3 className="text-lg font-semibold tracking-tight text-stone-950">{title}</h3>
      <p className="mt-1 text-sm leading-6 text-stone-500">{subtitle}</p>
      {shownStats.length > 0 ? (
        <div className={compact ? "mt-4 space-y-3" : "mt-5 space-y-4"}>
          {shownStats.map((stat) => (
            <div key={stat.label}>
              <div className="flex items-baseline justify-between gap-4 text-sm">
                <span className="min-w-0 truncate font-medium text-stone-800">{stat.label}</span>
                {filterForStat ? (
                  <PlanningFilterButton {...filterForStat(stat)} className="shrink-0 rounded-full border border-stone-200 bg-stone-50 px-2.5 py-1 font-semibold text-stone-950 transition hover:border-stone-400">
                    {formatPlanningCount(stat.count)}
                  </PlanningFilterButton>
                ) : (
                  <span className="shrink-0 font-semibold text-stone-950">{formatPlanningCount(stat.count)}</span>
                )}
              </div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-stone-100">
                <div className="h-full rounded-full bg-emerald-700" style={{ width: `${Math.max(6, (stat.count / maxCount) * 100)}%` }} />
              </div>
            </div>
          ))}
        </div>
      ) : <p className="mt-5 text-sm text-stone-500">No planning applications available yet.</p>}
    </div>
  )
}

type PlanningFilterSpec = {
  action: string
  fields: Partial<Record<keyof PlanningSearchParams, string>>
}

function PlanningFilterButton({
  action,
  fields,
  className,
  children,
}: PlanningFilterSpec & { className: string; children: React.ReactNode }) {
  return (
    <form action={action} method="get" className="inline-flex">
      {Object.entries(fields).map(([name, value]) => <input key={name} type="hidden" name={name} value={value} />)}
      <button type="submit" className={className}>{children}</button>
    </form>
  )
}

function formatPlanningCount(value: number) {
  return value.toLocaleString("en-IE")
}
