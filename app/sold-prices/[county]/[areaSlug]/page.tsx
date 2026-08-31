import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import PprDisclaimer from "@/components/ppr/PprDisclaimer"
import PprLocationInsights from "@/components/ppr/PprLocationInsights"
import PprSaleCard from "@/components/ppr/PprSaleCard"
import { getPprMarket, getRelevantMarketComparisonLinks } from "@/lib/ppr-markets"
import { formatPlanningDate } from "@/lib/planning"
import { planningResultRecord } from "@/lib/planning-result-presentation"
import { getPlanningApplicationsForSoldPriceArea } from "@/lib/property-research"
import {
  areaNameFromSlug,
  formatPprCountyDisplayName,
  formatPprCurrency,
  formatPprDate,
  formatPprDisplayText,
  getNearbyAreaLinks,
  isExcludedStandaloneAreaSlug,
} from "@/lib/ppr"
import { type PprDateRangeValue } from "@/lib/ppr"
import {
  euroDisplay,
  getAnalyticsRange,
  getAreaInsights,
  numberDisplay,
  signedPercent,
} from "@/lib/ppr-analytics"

export const revalidate = 21600
export const dynamicParams = true

// Area pages are generated on first request and retained as ISR entries.
export function generateStaticParams() {
  return []
}

type Props = {
  params: Promise<{ county: string; areaSlug: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { county, areaSlug } = await params
  if (isExcludedStandaloneAreaSlug(areaSlug)) notFound()
  const decodedCounty = decodeURIComponent(county)
  const countyLabel = formatPprCountyDisplayName(decodedCounty)
  const areaName = areaNameFromSlug(areaSlug)

  return {
    title: `${areaName} Property Prices, ${countyLabel} | Recent Sales & Trends`,
    description: `See what homes are selling for in ${areaName}, ${countyLabel}. View recent property sale prices, market trends and activity from recorded transactions.`,
    alternates: {
      canonical: `/sold-prices/${decodedCounty.toLowerCase()}/${areaSlug}`,
    },
    robots: {
      index: true,
      follow: true,
    },
  }
}

export default async function PprAreaPage({ params }: Props) {
  const { county, areaSlug } = await params
  if (isExcludedStandaloneAreaSlug(areaSlug)) notFound()
  const selectedRange: PprDateRangeValue = "last-year"
  const analyticsRange = getAnalyticsRange(selectedRange)
  const decodedCounty = decodeURIComponent(county)
  const countyLabel = formatPprCountyDisplayName(decodedCounty)
  const areaName = areaNameFromSlug(areaSlug)
  const areaTitle = `${formatPprDisplayText(areaName).toUpperCase()} MARKET`
  const areaMarket = getPprMarket(areaSlug)
  const comparisonLinks = areaMarket
    ? getRelevantMarketComparisonLinks(areaMarket)
    : [
        { href: "/sold-prices/rising-markets", label: "Rising Markets" },
        { href: "/sold-prices/affordable-markets", label: "Affordable Markets" },
      ]

  const [areaData, nearbyAreaCandidates, planningApplications] = await Promise.all([
    getAreaInsights(decodedCounty, areaSlug, selectedRange),
    getNearbyAreaLinks(decodedCounty, areaSlug),
    getPlanningApplicationsForSoldPriceArea(decodedCounty, areaName),
  ])
  const { insights, recentSales } = areaData
  const activityPeriodCount = insights.activity?.currentPeriodCount ?? 0
  const currentSalesCount = activityPeriodCount > 0 ? activityPeriodCount : insights.totalSalesCount
  const hasActivityComparison = insights.activity?.changePct !== undefined
  const hasRecordedSales = currentSalesCount > 0
  const aggregateUnavailable = !hasRecordedSales && recentSales.length > 0
  const snapshotMedian = insights.momentum?.currentMedian ?? insights.medianAllTime
  const recentSalesMedian = medianRecentSalePrice(recentSales)
  const summaryMedian = snapshotMedian ?? recentSalesMedian
  const summaryMedianUsesRecentFallback = snapshotMedian === undefined && recentSalesMedian !== undefined
  const summaryLastSaleDate = insights.lastSaleDate ?? recentSales[0]?.date_of_sale ?? null
  // Nearby candidates already come from the maintained ppr_area_stats snapshot.
  // Re-querying full insights for every card turned one locality view into N
  // additional reads and was a major multiplier during the saturation incident.
  const nearbyAreas = nearbyAreaCandidates

  return (
    <main className="min-h-screen bg-stone-50">
      <section className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
        <div className="overflow-hidden rounded-[32px] border border-stone-200 bg-white shadow-sm">
          <div className="bg-gradient-to-br from-stone-50 via-white to-stone-100 px-5 py-7 sm:px-8 md:px-10 md:py-10">
            <p className="text-sm font-medium uppercase tracking-[0.24em] text-stone-500">
              {areaTitle}
            </p>
            <h1 className="mt-2 text-4xl font-semibold tracking-tight text-stone-900 sm:text-5xl">
              Property prices in {areaName}, {countyLabel}
            </h1>
            <p className="mt-5 max-w-3xl text-base leading-7 text-stone-600 sm:text-lg sm:leading-8">
              See recent sold property prices, pricing trends and sales activity for {areaName}.
            </p>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-stone-600">
              This page summarises recorded Property Price Register transactions in {areaName},
              helping you compare recent sale prices and wider local market trends.
            </p>
            <div className="mt-5 flex flex-wrap gap-3">
              <Link
                href={`/sold-prices/${decodedCounty.toLowerCase()}`}
                className="inline-flex text-sm font-medium text-stone-600 transition hover:text-stone-900"
              >
                See {countyLabel} house prices
              </Link>
              <Link
                href="/sold-prices"
                className="inline-flex text-sm font-medium text-stone-600 transition hover:text-stone-900"
              >
                Back to Ireland house prices
              </Link>
            </div>
          </div>
        </div>

        <div className="mt-8 grid gap-4 md:grid-cols-4">
          <div className="rounded-[24px] border border-stone-200 bg-white p-5 shadow-sm">
            <p className="text-sm text-stone-500">
              {hasActivityComparison ? "Sales activity" : "Recorded sales"}
            </p>
            <p
              className={`mt-2 text-3xl font-semibold ${
                hasActivityComparison
                  ? insights.activity!.changePct! > 0
                    ? "text-emerald-700"
                    : insights.activity!.changePct! < 0
                      ? "text-rose-700"
                      : "text-stone-900"
                  : "text-stone-900"
              }`}
            >
              {hasActivityComparison
                ? insights.activity!.changePct! > 0
                  ? `↑ ${signedPercent(insights.activity!.changePct)}`
                  : insights.activity!.changePct! < 0
                    ? `↓ ${signedPercent(insights.activity!.changePct)}`
                    : "No change"
                : aggregateUnavailable
                  ? "Limited data"
                  : hasRecordedSales
                    ? `${numberDisplay(currentSalesCount)} ${currentSalesCount === 1 ? "sale" : "sales"}`
                    : "No sales"}
            </p>
            <p className="mt-2 text-xs leading-5 text-stone-500">
              {hasActivityComparison && insights.activity
                ? `${insights.activity.currentPeriodLabel} vs ${insights.activity.previousPeriodLabel}`
                : `Across ${analyticsRange.label}`}
            </p>
            <p className="text-xs leading-5 text-stone-500">
              {hasActivityComparison && insights.activity
                ? `${numberDisplay(insights.activity.currentPeriodCount)} vs ${numberDisplay(insights.activity.previousPeriodCount)} recorded sales`
                : aggregateUnavailable
                  ? "Sales are available, but the aggregate count is temporarily unavailable"
                  : hasRecordedSales
                    ? "Not enough sales for a reliable activity comparison"
                    : "No recorded transactions in this period"}
            </p>
          </div>
          <div className="rounded-[24px] border border-stone-200 bg-white p-5 shadow-sm">
            <p className="text-sm text-stone-500">Median price</p>
            <p className="mt-2 text-2xl font-semibold text-stone-900">
              {euroDisplay(summaryMedian)}
            </p>
            <p className="mt-2 text-xs leading-5 text-stone-500">
              {summaryMedianUsesRecentFallback
                ? `Median of ${numberDisplay(recentSales.length)} recent sales shown`
                : analyticsRange.helperText || `Across ${analyticsRange.label}`}
            </p>
          </div>
          <div className="rounded-[24px] border border-stone-200 bg-white p-5 shadow-sm">
            <p className="text-sm text-stone-500">Price change</p>
            <p
              className={`mt-2 text-2xl font-semibold ${
                insights.momentum?.yoyChangePct !== undefined
                  ? insights.momentum.yoyChangePct > 0
                    ? "text-emerald-700"
                    : insights.momentum.yoyChangePct < 0
                      ? "text-rose-700"
                      : "text-stone-900"
                  : "text-stone-900"
              }`}
            >
              {insights.momentum?.yoyChangePct !== undefined
                ? signedPercent(insights.momentum.yoyChangePct)
                : "Limited data"}
            </p>
            <p className="mt-2 text-xs leading-5 text-stone-500">
              {insights.momentum
                ? "Median price vs the previous 12 months"
                : "Not enough recent sales for a reliable price comparison"}
            </p>
          </div>
          <div className="rounded-[24px] border border-stone-200 bg-white p-5 shadow-sm">
            <p className="text-sm text-stone-500">Last sale</p>
            <p className="mt-2 text-2xl font-semibold text-stone-900">
              {formatPprDate(summaryLastSaleDate)}
            </p>
          </div>
        </div>

        <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_340px]">
          <section className="space-y-8">
            <div>
              <div className="mb-5">
                <p className="text-sm uppercase tracking-[0.18em] text-stone-500">
                  Market prices
                </p>
                <h2 className="mt-2 text-3xl font-semibold tracking-tight text-stone-900">
                  Prices and activity in {areaName}
                </h2>
                <p className="mt-3 max-w-3xl text-sm leading-6 text-stone-600">
                  Use these signals to compare local property prices, price change and recent market
                  activity in {areaName} against nearby parts of {countyLabel}.
                </p>
              </div>

              <PprLocationInsights
                areaLabel={areaName}
                insights={insights}
                rangeLabel={analyticsRange.label}
              />
            </div>
            <div>
              <div className="mb-5">
                <p className="text-sm uppercase tracking-[0.18em] text-stone-500">
                  Recent register entries
                </p>
                <h2 className="mt-2 text-3xl font-semibold tracking-tight text-stone-900">
                  Latest sales in {areaName}.
                </h2>
              </div>

              {recentSales.length > 0 ? (
                <div className="space-y-4">
                  {recentSales.map((sale) => (
                    <PprSaleCard key={sale.id} sale={sale} showAreaLink={false} />
                  ))}
                </div>
              ) : (
                <div className="rounded-[28px] border border-stone-200 bg-white p-8 text-stone-600 shadow-sm">
                  No recent sales are available for this area yet.
                </div>
              )}
            </div>

            <div className="rounded-[28px] border border-stone-200 bg-white p-6 shadow-sm sm:p-8">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <p className="text-sm uppercase tracking-[0.18em] text-stone-500">Development activity</p>
                  <h2 className="mt-2 text-3xl font-semibold tracking-tight text-stone-900">Planning applications in {areaName}</h2>
                  <p className="mt-3 max-w-2xl text-sm leading-6 text-stone-600">Recent applications matched by the area name in the published application address. This does not imply a link to any sold property shown above.</p>
                </div>
                <form action="/planning" method="get" className="shrink-0">
                  <input type="hidden" name="area" value={areaName} />
                  <button type="submit" className="text-sm font-semibold text-stone-700 transition hover:text-stone-950">
                    Search all planning →
                  </button>
                </form>
              </div>

              {planningApplications.length > 0 ? (
                <div className="mt-6 divide-y divide-stone-200 border-y border-stone-200">
                  {planningApplications.map((application) => {
                    const result = planningResultRecord(application)
                    const href = result.detailHref || "/planning"
                    const location = result.location || result.authority

                    return (
                      <article key={application.id} className="py-5 sm:px-2">
                        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                          <p className="font-mono text-sm font-semibold text-emerald-800">
                            {result.reference}
                          </p>
                          <p className="text-xs font-medium text-stone-500">
                            Registered {formatPlanningDate(result.registrationDate)}
                          </p>
                        </div>
                        <h3 className="mt-2 text-base font-semibold leading-6 text-stone-900">
                          <Link href={href} className="transition hover:text-emerald-800">
                            {location}
                          </Link>
                        </h3>
                        <p className="mt-1.5 line-clamp-2 text-sm leading-6 text-stone-600">
                          {result.proposal}
                        </p>
                        <div className="mt-3 flex flex-wrap items-center gap-3">
                          {result.status ? (
                            <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-800">
                              {result.status}
                            </span>
                          ) : null}
                          <Link
                            href={href}
                            className="text-sm font-semibold text-stone-700 transition hover:text-emerald-800"
                          >
                            View application →
                          </Link>
                        </div>
                      </article>
                    )
                  })}
                </div>
              ) : (
                <p className="mt-6 rounded-2xl bg-stone-50 p-5 text-sm leading-6 text-stone-600">No recent planning applications could be matched reliably to this locality. Try the full planning search.</p>
              )}
            </div>
          </section>

          <aside className="space-y-5">
            <PprDisclaimer />

            <div className="rounded-[28px] border border-stone-200 bg-white p-6 shadow-sm">
              <p className="text-sm uppercase tracking-[0.18em] text-stone-500">
                Sold prices
              </p>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight text-stone-900">
                Compare this market.
              </h2>
              <p className="mt-3 text-sm leading-6 text-stone-600">
                See how {areaName} compares with similar nearby markets and broader tracked views.
              </p>
              <div className="mt-5 flex flex-wrap gap-3">
                {comparisonLinks.map((link, index) => (
                  <Link
                    key={link.href}
                    href={link.href}
                    className={
                      index === 0
                        ? "inline-flex rounded-full bg-stone-900 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-stone-700"
                        : "inline-flex rounded-full border border-stone-300 px-5 py-2.5 text-sm font-medium text-stone-700 transition hover:border-stone-900 hover:text-stone-900"
                    }
                  >
                    {link.label}
                  </Link>
                ))}
              </div>
            </div>

            {nearbyAreas.length > 0 && (
              <div className="rounded-[28px] border border-stone-200 bg-white p-6 shadow-sm">
                <p className="text-sm uppercase tracking-[0.18em] text-stone-500">
                  Nearby areas
                </p>
                <div className="mt-4 space-y-3">
                  {nearbyAreas.map((area) => (
                    <Link
                      key={`${area.county}-${area.area_slug}`}
                      href={`/sold-prices/${encodeURIComponent(String(area.county || decodedCounty).toLowerCase())}/${area.area_slug}`}
                      className="block rounded-2xl border border-stone-200 bg-stone-50 px-4 py-3 transition hover:border-stone-300 hover:bg-white"
                    >
                      <p className="font-medium text-stone-900">
                        {areaNameFromSlug(area.area_slug || "")}
                      </p>
                      <p className="mt-1 text-sm text-stone-500">
                        {formatPprCurrency(area.median_price_eur)} median
                      </p>
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </aside>
        </div>
      </section>
    </main>
  )
}

function medianRecentSalePrice(sales: Array<{ price_eur: number | string }>) {
  const prices = sales
    .map((sale) => Number(sale.price_eur))
    .filter((price) => Number.isFinite(price))
    .sort((left, right) => left - right)

  if (prices.length === 0) return undefined

  const midpoint = Math.floor(prices.length / 2)
  if (prices.length % 2 === 0) {
    return (prices[midpoint - 1] + prices[midpoint]) / 2
  }

  return prices[midpoint]
}
