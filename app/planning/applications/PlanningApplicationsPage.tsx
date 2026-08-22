import type { Metadata } from "next"
import Link from "next/link"
import PlanningResultsView, {
  type PlanningResultRecord,
} from "@/components/planning/PlanningResultsView"
import {
  type PlanningAuthority,
} from "@/lib/planning-authorities"
import {
  formatPlanningDate,
  formatPlanningMonth,
  getPlanningDashboard,
  normalisePlanningSearchParams,
  type PlanningCountStat,
  type PlanningSearchParams,
} from "@/lib/planning"
import {
  countyForPlanningAuthority,
} from "@/lib/property-intelligence"
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
  alternates: {
    canonical: "/planning",
  },
  robots: {
    index: true,
    follow: true,
  },
}

export default function PlanningPage() {
  return <PlanningApplicationsView />
}

export async function PlanningApplicationsView({
  searchParams,
  authority,
}: {
  searchParams?: Promise<PlanningSearchParams>
  authority?: PlanningAuthority
}) {
  const rawSearchParams = await (searchParams || Promise.resolve({}))
  const filters = normalisePlanningSearchParams(rawSearchParams)
  const hasActiveSearch = Boolean(
    filters.q ||
      filters.area ||
      filters.council ||
      filters.status ||
      filters.type ||
      filters.sort === "oldest"
  )

  const dashboard = await getPlanningDashboard(filters, authority ?? null)
  const resultRows = hasActiveSearch
    ? dashboard.searchResults
    : dashboard.recentApplications
  const planningResults: PlanningResultRecord[] = resultRows.map(planningResultRecord)
  const mostCommonType = dashboard.typeStats[0]
  const isCouncilScoped = Boolean(authority || filters.council)
  const planningPath = authority ? `/planning/${authority.slug}` : "/planning"
  const pageTitle = authority
    ? `${authority.shortName} planning applications`
    : "National planning applications"
  const pageDescription = authority
    ? `Search available recorded history of ${authority.name} planning applications by location, reference, development, applicant or status.`
    : "Search Irish planning applications across available official history by location, reference, development, applicant or status."
  const latestRegistrationsLabel = authority
    ? `Latest registrations from ${authority.name}.`
    : "Latest registrations across available local authorities."
  const latestMonthLabel = dashboard.latestRegistrationMonth
    ? formatPlanningMonth(dashboard.latestRegistrationMonth)
    : "latest month"
  const usesNationalComparisonWindow = !authority && !hasActiveSearch
  const councilComparisonLabel =
    dashboard.councilActivityPeriodStart && dashboard.councilActivityPeriodEnd
      ? `Latest 12 months, using the same period nationally: ${formatPlanningDate(dashboard.councilActivityPeriodStart)} to ${formatPlanningDate(dashboard.councilActivityPeriodEnd)}.`
      : "Latest 12 months, using the same period nationally."
  const availableHistoryLabel =
    "Based on available OpenList planning records for this scope."
  const areaPeriodLabel = usesNationalComparisonWindow
    ? councilComparisonLabel
    : availableHistoryLabel
  const areaSubtitle = usesNationalComparisonWindow
    ? `Most active local authorities. ${councilComparisonLabel}`
    : authority
      ? `Top ${authority.shortName} localities across available recorded history.`
      : filters.council
        ? `Top localities in ${filters.council} across available recorded history.`
        : "Council totals across available recorded history for the selected filters."
  const areaFilterLabel = authority ? "Area" : "Council"
  const areaFilterName = authority ? "area" : "council"
  const areaFilterValue = authority ? filters.area : filters.council
  const areaFilterKey = isCouncilScoped ? "area" : "council"
  const areaStatsTitle = isCouncilScoped
    ? "Applications by area"
    : "Applications by council"
  const latestMonthAreaTitle = authority
    ? `Areas in ${latestMonthLabel}`
    : filters.council
      ? `Areas in ${latestMonthLabel}`
      : `Councils in ${latestMonthLabel}`
  const latestMonthAreaSubtitle = authority
    ? "Localities with the most applications in the latest registration month."
    : filters.council
      ? "Localities with the most applications in the latest registration month."
      : "Local authorities with the most applications in the latest registration month."
  const quickCouncilStats = !authority && !hasActiveSearch
    ? dashboard.councilActivityStats.slice(0, 5)
    : []
  const statsWindowLabel = usesNationalComparisonWindow
    ? `Applications, status mix and application types use available recorded history. Council comparisons use the ${councilComparisonLabel.charAt(0).toLowerCase()}${councilComparisonLabel.slice(1)} Monthly trends use the latest 12 completed registration months; latest-month measures use the latest registration month.`
    : "Applications, area totals, status mix and application types use available recorded history. Monthly trends use the latest 12 completed registration months; latest-month measures use the latest registration month."
  const datasetNote = authority
    ? `This view uses public ${authority.name} planning application information available in OpenList. Linked application documents are not included.`
    : "This view uses public planning application information available in OpenList from Irish local-authority sources. Linked application documents are not included."
  const soldPriceCounty = authority
    ? countyForPlanningAuthority(authority.code)
    : null

  return (
    <main className="bg-stone-50">
      <section className="border-b border-stone-200 bg-white">
        <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 lg:py-16">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-stone-500">
              Planning in Ireland
            </p>
            <h1 className="mt-4 max-w-4xl text-4xl font-semibold tracking-tight text-stone-950 sm:text-5xl">
              {pageTitle}
            </h1>
            <p className="mt-5 max-w-3xl text-lg leading-8 text-stone-600">
              {pageDescription}
            </p>
            <p className="mt-3 text-sm text-stone-600">
              Latest registered application: {formatPlanningDate(dashboard.latestRegistrationDate)} · Source: {authority?.name ?? "Irish local authorities"}
            </p>
            {soldPriceCounty ? (
              <Link
                href={`/sold-prices/${soldPriceCounty.toLowerCase()}`}
                className="mt-4 inline-flex text-sm font-semibold text-emerald-800 transition hover:text-emerald-950"
              >
                Sold prices in {soldPriceCounty} <span aria-hidden="true" className="ml-1">→</span>
              </Link>
            ) : null}
          </div>

          <form
            action={planningPath}
            className="mt-10 grid gap-3 rounded-2xl border border-stone-300 bg-stone-50 p-4 shadow-sm sm:grid-cols-[minmax(0,1.5fr)_repeat(4,minmax(135px,0.7fr))_auto] sm:p-5"
          >
            <input
              id="planning-search"
              name="q"
              type="search"
              aria-label="Search planning applications"
              defaultValue={filters.q}
              placeholder="Search an address, area, planning reference or development"
              className="min-h-14 rounded-lg border border-stone-300 bg-white px-4 text-base text-stone-900 outline-none transition placeholder:text-stone-400 focus:border-stone-900 focus:ring-2 focus:ring-stone-200"
            />

            <SelectFilter
              label={areaFilterLabel}
              name={areaFilterName}
              value={areaFilterValue}
              options={[...dashboard.areaOptions].sort((left, right) =>
                left.localeCompare(right, "en-IE", { sensitivity: "base" })
              )}
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
            <SelectFilter
              label="Sort by"
              name="sort"
              value={filters.sort}
              options={[
                { value: "newest", label: "Newest applications" },
                { value: "oldest", label: "Oldest applications" },
              ]}
            />

            <div className="flex flex-col gap-2 sm:flex-row">
              <button
                type="submit"
                className="min-h-14 rounded-lg bg-stone-950 px-5 text-base font-semibold text-white transition hover:bg-stone-700"
              >
                Search planning
              </button>
              {hasActiveSearch ? (
                <Link
                  href={planningPath}
                  className="inline-flex min-h-14 items-center justify-center rounded-lg border border-stone-300 bg-white px-5 text-base font-semibold text-stone-700 transition hover:border-stone-900 hover:text-stone-950"
                >
                  Clear
                </Link>
              ) : null}
            </div>
          </form>

          {!dashboard.aggregateAvailable ? (
            <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-950">
              Planning statistics are temporarily unavailable. Recent applications and search remain available.
            </p>
          ) : null}

          {quickCouncilStats.length > 0 ? (
            <div className="mt-4 flex flex-wrap items-center gap-2 text-sm">
              <span className="mr-1 font-semibold text-stone-500">
                Most active councils
              </span>
              {quickCouncilStats.map((stat) => (
                <PlanningFilterButton
                  key={stat.label}
                  action={planningPath}
                  fields={buildPlanningFilterFields(
                    filters,
                    "council",
                    stat.label
                  )}
                  className="inline-flex min-h-10 items-center rounded-md border border-stone-200 bg-white px-3 font-semibold text-stone-800 transition hover:border-stone-400 hover:text-stone-950"
                >
                  {stat.label}
                  <span className="ml-2 text-stone-500">
                    {stat.count.toLocaleString("en-IE")}
                  </span>
                </PlanningFilterButton>
              ))}
            </div>
          ) : null}
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
                    ? `${formatPlanningCount(dashboard.searchCount)} planning applications match the selected filters.`
                    : latestRegistrationsLabel}
                </p>
              </div>
              {hasActiveSearch ? (
                <Link
                  href={planningPath}
                  className="self-start text-sm font-semibold text-stone-700 transition hover:text-stone-950"
                >
                  Clear filters
                </Link>
              ) : null}
            </div>

            <PlanningResultsView applications={planningResults} />
          </div>

          {dashboard.aggregateAvailable ? <div className="grid gap-6 lg:grid-cols-2">
            <BarList
              title={areaStatsTitle}
              subtitle={areaSubtitle}
              stats={dashboard.areaStats}
              filterForStat={(stat) =>
                planningFilterSpec(planningPath, filters, areaFilterKey, stat.label)
              }
            />
            <BarList
              title="Monthly registrations"
              subtitle="Latest 12 completed registration months."
              stats={dashboard.monthStats.map((stat) => ({
                ...stat,
                label: formatPlanningMonth(stat.label),
              }))}
            />
          </div> : null}

          {dashboard.aggregateAvailable ? <div className="grid gap-6 lg:grid-cols-3">
            <BarList
              title={latestMonthAreaTitle}
              subtitle={latestMonthAreaSubtitle}
              stats={dashboard.latestMonthAreaStats}
              filterForStat={(stat) =>
                planningFilterSpec(planningPath, filters, areaFilterKey, stat.label)
              }
            />
            <BarList
              title={`Status in ${latestMonthLabel}`}
              subtitle="Current status mix for applications registered in the latest month."
              stats={dashboard.latestMonthStatusStats}
              filterForStat={(stat) =>
                planningFilterSpec(planningPath, filters, "status", stat.label)
              }
            />
            <BarList
              title={`Types in ${latestMonthLabel}`}
              subtitle="Most common application types registered in the latest month."
              stats={dashboard.latestMonthTypeStats}
              filterForStat={(stat) =>
                planningFilterSpec(planningPath, filters, "type", stat.label)
              }
            />
          </div> : null}
        </div>

        <aside className="min-w-0 space-y-6">
          <div className="rounded-lg border border-stone-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-semibold tracking-tight text-stone-950">
              Source notes
            </h2>
            <div className="mt-4 space-y-4 text-sm leading-6 text-stone-600">
              <p>{datasetNote}</p>
              <p>
                Application information is shown as published by the council. Always
                check the official application record before making decisions.
              </p>
            </div>
          </div>

          {dashboard.aggregateAvailable ? <InsightCard
            title="Most common application type"
            value={mostCommonType?.label ?? "Not recorded"}
            detail={
              mostCommonType
                ? `${formatPlanningCount(mostCommonType.count)} planning applications across available recorded history.`
                : "No application types were available."
            }
          /> : null}

          {dashboard.aggregateAvailable ? <BarList
            title="Status mix"
            subtitle="Current public status labels across available recorded history."
            stats={dashboard.statusStats}
            compact
            filterForStat={(stat) =>
              planningFilterSpec(planningPath, filters, "status", stat.label)
            }
          /> : null}

          {dashboard.aggregateAvailable ? <BarList
            title="Application types"
            subtitle="Most frequent application type labels across available recorded history."
            stats={dashboard.typeStats}
            compact
            filterForStat={(stat) =>
              planningFilterSpec(planningPath, filters, "type", stat.label)
            }
          /> : null}
        </aside>
      </section>

      {dashboard.aggregateAvailable ? <section className="border-y border-stone-200 bg-white">
        <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 lg:py-14">
          <h2 className="text-2xl font-semibold tracking-tight text-stone-950">
            Planning activity and trends
          </h2>
          <p className="mt-2 text-sm leading-6 text-stone-500">{statsWindowLabel}</p>

          <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            <Metric
              label="Applications"
              value={dashboard.totalCount}
              detail="Available recorded history."
            />
            <Metric
              label="Latest registered"
              value={formatPlanningDate(dashboard.latestRegistrationDate)}
              detail="Most recent registration in this scope."
            />
            <Metric
              label={isCouncilScoped ? "Most active area" : "Most active council"}
              value={dashboard.activeArea?.label ?? "Not recorded"}
              detail={areaPeriodLabel}
            />
            <Metric
              label="Most common type"
              value={mostCommonType?.label ?? "Not recorded"}
              detail="Available recorded history."
            />
            <Metric
              label="Latest month apps"
              value={dashboard.latestMonthCount}
              detail="Latest registration month."
            />
            <Metric
              label="Month change"
              value={formatSignedNumber(dashboard.latestMonthChange)}
              detail="Against the previous registration month."
            />
          </div>

          <div className="mt-6 grid gap-4 lg:grid-cols-2">
            <TrendPanel stats={dashboard.monthStats} />
            <TreemapPanel
              title={isCouncilScoped ? "Area overview" : "Council overview"}
              stats={dashboard.areaStats}
              emptyLabel={isCouncilScoped ? "No areas recorded" : "No councils recorded"}
              periodLabel={areaPeriodLabel}
            />
            <DistributionPanel
              title="Status mix"
              stats={dashboard.statusStats}
              emptyLabel="No statuses recorded"
              periodLabel={availableHistoryLabel}
            />
            <DistributionPanel
              title="Application types"
              stats={dashboard.typeStats}
              emptyLabel="No types recorded"
              periodLabel={availableHistoryLabel}
            />
          </div>
        </div>
      </section> : null}
    </main>
  )
}

function planningFilterSpec(
  basePath: string,
  filters: Required<PlanningSearchParams>,
  key: PlanningFilterKey,
  value: string
) {
  return {
    action: basePath,
    fields: buildPlanningFilterFields(filters, key, value),
  }
}

function Metric({
  label,
  value,
  detail,
}: {
  label: string
  value: string | number
  detail: string
}) {
  return (
    <div className="flex min-h-28 flex-col justify-between rounded-lg border border-stone-200 bg-stone-50 p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-500">
        {label}
      </p>
      <p className="mt-3 min-w-0 break-words text-2xl font-semibold leading-tight tracking-tight text-stone-950 lg:text-xl xl:text-2xl">
        {typeof value === "number" ? formatPlanningCount(value) : value}
      </p>
      <p className="mt-2 text-xs leading-5 text-stone-500">{detail}</p>
    </div>
  )
}

function TreemapPanel({
  title,
  stats,
  emptyLabel,
  periodLabel,
}: {
  title: string
  stats: PlanningCountStat[]
  emptyLabel: string
  periodLabel: string
}) {
  const total = stats.reduce((sum, stat) => sum + stat.count, 0)
  const lead = stats[0]
  const tiles = buildTreemapTiles(stats)

  return (
    <div className="rounded-lg border border-stone-200 bg-white p-5 shadow-sm">
      <div>
        <h3 className="text-base font-semibold tracking-tight text-stone-950">
          {title}
        </h3>
        <p className="mt-1 text-sm text-stone-500">
          {lead
            ? `${lead.label} accounts for ${formatShare(lead.count, total)}`
            : emptyLabel}
        </p>
        <p className="mt-1 text-xs leading-5 text-stone-500">{periodLabel}</p>
      </div>

      {tiles.length > 0 ? (
        <div className="mt-5">
          <div
            role="img"
            aria-label="Planning activity treemap"
            className="relative h-64 overflow-hidden rounded-md border border-stone-200 bg-stone-100 sm:h-72"
          >
            {tiles.map((tile, index) => (
              <div
                key={tile.label}
                className={treemapTileClass(index)}
                style={{
                  left: `${tile.x}%`,
                  top: `${tile.y}%`,
                  width: `${tile.width}%`,
                  height: `${tile.height}%`,
                }}
              >
                <span className="block text-xs font-semibold leading-tight">
                  {tile.label}
                </span>
                <span className="mt-1 block text-xs font-medium opacity-85">
                  {formatShare(tile.count, total)}
                </span>
              </div>
            ))}
          </div>

          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            {stats.slice(0, 6).map((stat) => (
              <div
                key={stat.label}
                className="flex items-baseline justify-between gap-3 rounded-md bg-stone-50 px-3 py-2 text-sm"
              >
                <span className="min-w-0 font-medium leading-tight text-stone-800">
                  {stat.label}
                </span>
                <span className="shrink-0 font-semibold text-stone-950">
                  {formatShare(stat.count, total)}
                </span>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="mt-5 flex h-64 w-full items-center justify-center rounded-md bg-stone-50 px-3 text-center text-sm text-stone-500 sm:h-72">
          {emptyLabel}
        </div>
      )}
    </div>
  )
}

function buildTreemapTiles(stats: PlanningCountStat[]) {
  const topStats = stats.slice(0, 8)
  const visibleTotal = topStats.reduce((sum, stat) => sum + stat.count, 0)
  if (visibleTotal <= 0) return []

  const rows: PlanningCountStat[][] = []
  let row: PlanningCountStat[] = []
  let rowTotal = 0
  const targetRowTotal = visibleTotal / 3

  for (const stat of topStats) {
    if (row.length > 0 && rowTotal + stat.count > targetRowTotal && rows.length < 2) {
      rows.push(row)
      row = []
      rowTotal = 0
    }

    row.push(stat)
    rowTotal += stat.count
  }

  if (row.length > 0) rows.push(row)

  let y = 0

  return rows.flatMap((currentRow) => {
    const currentRowTotal = currentRow.reduce((sum, stat) => sum + stat.count, 0)
    const rowHeight = (currentRowTotal / visibleTotal) * 100
    let x = 0

    const rowTiles = currentRow.map((stat) => {
      const width = (stat.count / currentRowTotal) * 100
      const tile = {
        ...stat,
        x,
        y,
        width,
        height: rowHeight,
      }

      x += width
      return tile
    })

    y += rowHeight
    return rowTiles
  })
}

function treemapTileClass(index: number) {
  const classes = [
    "absolute flex flex-col justify-end overflow-hidden border border-white/80 bg-emerald-800 p-2 text-white",
    "absolute flex flex-col justify-end overflow-hidden border border-white/80 bg-teal-700 p-2 text-white",
    "absolute flex flex-col justify-end overflow-hidden border border-white/80 bg-lime-700 p-2 text-white",
    "absolute flex flex-col justify-end overflow-hidden border border-white/80 bg-stone-700 p-2 text-white",
    "absolute flex flex-col justify-end overflow-hidden border border-white/80 bg-emerald-600 p-2 text-white",
    "absolute flex flex-col justify-end overflow-hidden border border-white/80 bg-teal-600 p-2 text-white",
    "absolute flex flex-col justify-end overflow-hidden border border-white/80 bg-lime-600 p-2 text-white",
    "absolute flex flex-col justify-end overflow-hidden border border-white/80 bg-stone-500 p-2 text-white",
  ]

  return classes[index % classes.length]
}

function TrendPanel({ stats }: { stats: PlanningCountStat[] }) {
  const currentMonth = currentPlanningMonthKey()
  const chartStats = stats.filter((stat) => stat.label < currentMonth).slice(-12)
  const maxCount = Math.max(...chartStats.map((stat) => stat.count), 1)
  const latest = chartStats.at(-1)
  const previous = chartStats.at(-2)
  const latestDelta = latest && previous ? latest.count - previous.count : null
  const width = 420
  const height = 220
  const paddingLeft = 42
  const paddingRight = 18
  const paddingTop = 18
  const paddingBottom = 38
  const chartWidth = width - paddingLeft - paddingRight
  const chartHeight = height - paddingTop - paddingBottom
  const points = chartStats.map((stat, index) => {
    const x =
      chartStats.length === 1
        ? width / 2
        : paddingLeft + (index / (chartStats.length - 1)) * chartWidth
    const y = paddingTop + (1 - stat.count / maxCount) * chartHeight

    return { ...stat, x, y }
  })
  const linePath = points
    .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`)
    .join(" ")
  const areaPath =
    points.length > 0
      ? `${linePath} L ${points.at(-1)?.x} ${height - paddingBottom} L ${points[0].x} ${
          height - paddingBottom
        } Z`
      : ""
  const yTicks = [1, 0.75, 0.5, 0.25, 0].map((ratio) => ({
    y: paddingTop + ratio * chartHeight,
    value: Math.round((1 - ratio) * maxCount),
  }))

  return (
    <div className="rounded-lg border border-stone-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-base font-semibold tracking-tight text-stone-950">
            Monthly trend
          </h3>
          <p className="mt-1 text-sm text-stone-500">
            {latest
              ? `Latest 12 completed registration months. Latest shown: ${formatPlanningMonth(latest.label)}.`
              : "Latest 12 completed registration months. No month data."}
          </p>
        </div>
        <p className="rounded-md bg-stone-100 px-2.5 py-1 text-sm font-semibold text-stone-800">
          {latestDelta === null ? "n/a" : formatSignedNumber(latestDelta)}
        </p>
      </div>

      <div className="mt-5">
        {chartStats.length > 0 ? (
          <>
            <svg
              role="img"
              aria-label="Planning applications by month"
              viewBox={`0 0 ${width} ${height}`}
              className="h-64 w-full overflow-visible sm:h-72"
              preserveAspectRatio="xMidYMid meet"
            >
              <defs>
                <linearGradient id="planningTrendFill" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0%" stopColor="rgb(4 120 87)" stopOpacity="0.22" />
                  <stop offset="100%" stopColor="rgb(4 120 87)" stopOpacity="0.03" />
                </linearGradient>
              </defs>
              {yTicks.map((tick) => (
                <g key={tick.y}>
                  <path
                    d={`M ${paddingLeft} ${tick.y} H ${width - paddingRight}`}
                    fill="none"
                    stroke="rgb(231 229 228)"
                    strokeWidth="1"
                    vectorEffect="non-scaling-stroke"
                  />
                  <text
                    x={paddingLeft - 10}
                    y={tick.y + 4}
                    textAnchor="end"
                    className="fill-stone-400 text-[10px] font-medium"
                  >
                    {formatPlanningCount(tick.value)}
                  </text>
                </g>
              ))}
              <path
                d={`M ${paddingLeft} ${height - paddingBottom} H ${
                  width - paddingRight
                }`}
                fill="none"
                stroke="rgb(168 162 158)"
                strokeWidth="1"
                vectorEffect="non-scaling-stroke"
              />
              {areaPath ? (
                <path d={areaPath} fill="url(#planningTrendFill)" />
              ) : null}
              <path
                d={linePath}
                fill="none"
                stroke="rgb(4 120 87)"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="3"
                vectorEffect="non-scaling-stroke"
              />
              {points.map((point) => (
                <g key={point.label}>
                  <circle
                    cx={point.x}
                    cy={point.y}
                    r="4"
                    fill="white"
                    stroke="rgb(4 120 87)"
                    strokeWidth="2"
                    vectorEffect="non-scaling-stroke"
                  />
                  <circle
                    cx={point.x}
                    cy={point.y}
                    r="1.5"
                    fill="rgb(4 120 87)"
                  />
                </g>
              ))}
              {points.map((point, index) =>
                index === 0 ||
                index === points.length - 1 ||
                index === Math.floor(points.length / 2) ? (
                  <text
                    key={`${point.label}-label`}
                    x={point.x}
                    y={height - 16}
                    textAnchor="middle"
                    className="fill-stone-500 text-[10px] font-medium"
                  >
                    {formatShortPlanningMonth(point.label)}
                  </text>
                ) : null
              )}
            </svg>
          </>
        ) : (
          <div className="flex h-64 w-full items-center justify-center rounded-md bg-stone-50 text-sm text-stone-500 sm:h-72">
            No trend data
          </div>
        )}
      </div>
    </div>
  )
}

function DistributionPanel({
  title,
  stats,
  emptyLabel,
  periodLabel,
}: {
  title: string
  stats: PlanningCountStat[]
  emptyLabel: string
  periodLabel: string
}) {
  const shownStats = stats.slice(0, 4)
  const total = stats.reduce((sum, stat) => sum + stat.count, 0)
  const maxCount = Math.max(...shownStats.map((stat) => stat.count), 1)
  const lead = shownStats[0]

  return (
    <div className="rounded-lg border border-stone-200 bg-white p-5 shadow-sm">
      <div>
        <h3 className="text-base font-semibold tracking-tight text-stone-950">
          {title}
        </h3>
        <p className="mt-1 text-sm text-stone-500">
          {lead
            ? `${lead.label} accounts for ${formatShare(lead.count, total)}`
            : emptyLabel}
        </p>
        <p className="mt-1 text-xs leading-5 text-stone-500">{periodLabel}</p>
      </div>

      <div className="mt-5 space-y-3">
        {shownStats.length > 0 ? (
          shownStats.map((stat) => (
            <div key={stat.label}>
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span className="min-w-0 truncate font-medium text-stone-800">
                  {stat.label}
                </span>
                <span className="shrink-0 font-semibold text-stone-950">
                  {formatShare(stat.count, total)}
                </span>
              </div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-stone-100">
                <div
                  className="h-full rounded-full bg-emerald-700"
                  style={{ width: `${Math.max(6, (stat.count / maxCount) * 100)}%` }}
                />
              </div>
            </div>
          ))
        ) : (
          <div className="rounded-md bg-stone-50 px-3 py-6 text-center text-sm text-stone-500">
            {emptyLabel}
          </div>
        )}
      </div>
    </div>
  )
}

function formatShare(count: number, total: number) {
  if (total <= 0) return "0%"
  return `${Math.round((count / total) * 100)}%`
}

function formatShortPlanningMonth(value: string | undefined) {
  if (!value) return ""

  const date = new Date(`${value}-01T00:00:00`)
  if (Number.isNaN(date.getTime())) return value

  return new Intl.DateTimeFormat("en-IE", {
    month: "short",
    year: "2-digit",
  }).format(date)
}

function currentPlanningMonthKey() {
  const now = new Date()

  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`
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
  options: Array<string | { value: string; label: string }>
}) {
  return (
    <select
      name={name}
      aria-label={label}
      defaultValue={value}
      className="min-h-12 min-w-0 rounded-md border border-stone-200 bg-white px-3 text-base text-stone-900 outline-none transition focus:border-stone-900"
    >
      <option value="">{label}</option>
      {options.map((option) => {
        const value = typeof option === "string" ? option : option.value
        const optionLabel = typeof option === "string" ? option : option.label
        return <option key={value} value={value}>
          {optionLabel}
        </option>
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
                {filterForStat ? (
                  <PlanningFilterButton
                    {...filterForStat(stat)}
                    className="shrink-0 rounded-full border border-stone-200 bg-stone-50 px-2.5 py-1 font-semibold text-stone-950 transition hover:border-stone-400"
                  >
                    {formatPlanningCount(stat.count)}
                  </PlanningFilterButton>
                ) : (
                  <span className="shrink-0 font-semibold text-stone-950">
                    {formatPlanningCount(stat.count)}
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
        <p className="mt-5 text-sm text-stone-500">No planning applications available yet.</p>
      )}
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
}: PlanningFilterSpec & {
  className: string
  children: React.ReactNode
}) {
  return (
    <form action={action} method="get" className="inline-flex">
      {Object.entries(fields).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      <button type="submit" className={className}>
        {children}
      </button>
    </form>
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

function formatPlanningCount(value: number) {
  return value.toLocaleString("en-IE")
}
