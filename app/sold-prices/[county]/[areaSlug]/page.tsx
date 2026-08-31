import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import PprDisclaimer from "@/components/ppr/PprDisclaimer"
import PprLocationInsights from "@/components/ppr/PprLocationInsights"
import PprSaleCard from "@/components/ppr/PprSaleCard"
import { getPprMarket, getRelevantMarketComparisonLinks } from "@/lib/ppr-markets"
import {
  areaNameFromSlug,
  formatPprCountyDisplayName,
  formatPprDate,
  formatPprDisplayText,
  isExcludedStandaloneAreaSlug,
  type PprDateRangeValue,
} from "@/lib/ppr"
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

  // Keep the locality request focused on its core PPR data. Planning crossover
  // and same-county alternatives used to add two independent DB reads to every
  // cold render. Both journeys remain available as links without delaying this page.
  const { insights, recentSales } = await getAreaInsights(
    decodedCounty,
    areaSlug,
    selectedRange
  )

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
  const planningHref = `/planning?area=${encodeURIComponent(areaName)}`

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
              This page summarises recorded Property Price Register transactions in {areaName}, helping you compare recent sale prices and wider local market trends.
            </p>
            <div className="mt-5 flex flex-wrap gap-x-5 gap-y-2 text-sm font-semibold">
              <Link href={`/sold-prices/${decodedCounty.toLowerCase()}`} className="text-stone-700 transition hover:text-stone-950">
                See {countyLabel} house prices →
              </Link>
              <Link href={planningHref} className="text-emerald-800 transition hover:text-emerald-950">
                Planning in {areaName} →
              </Link>
            </div>
          </div>
        </div>

        <div className="mt-8 grid gap-4 md:grid-cols-4">
          <MetricCard
            label={hasActivityComparison ? "Sales activity" : "Recorded sales"}
            value={
              hasActivityComparison
                ? insights.activity!.changePct! > 0
                  ? `↑ ${signedPercent(insights.activity!.changePct)}`
                  : insights.activity!.changePct! < 0
                    ? `↓ ${signedPercent(insights.activity!.changePct)}`
                    : "No change"
                : aggregateUnavailable
                  ? "Limited data"
                  : hasRecordedSales
                    ? `${numberDisplay(currentSalesCount)} ${currentSalesCount === 1 ? "sale" : "sales"}`
                    : "No sales"
            }
            detail={
              hasActivityComparison && insights.activity
                ? `${insights.activity.currentPeriodLabel} vs ${insights.activity.previousPeriodLabel} · ${numberDisplay(insights.activity.currentPeriodCount)} vs ${numberDisplay(insights.activity.previousPeriodCount)} recorded sales`
                : aggregateUnavailable
                  ? "Sales are available, but the aggregate count is temporarily unavailable"
                  : `Across ${analyticsRange.label}`
            }
            tone={hasActivityComparison ? insights.activity?.changePct : undefined}
          />
          <MetricCard
            label="Median price"
            value={euroDisplay(summaryMedian)}
            detail={
              summaryMedianUsesRecentFallback
                ? `Median of ${numberDisplay(recentSales.length)} recent sales shown`
                : analyticsRange.helperText || `Across ${analyticsRange.label}`
            }
          />
          <MetricCard
            label="Price change"
            value={insights.momentum?.yoyChangePct !== undefined ? signedPercent(insights.momentum.yoyChangePct) : "Limited data"}
            detail={insights.momentum ? "Median price vs the previous 12 months" : "Not enough recent sales for a reliable price comparison"}
            tone={insights.momentum?.yoyChangePct}
          />
          <MetricCard label="Last sale" value={formatPprDate(summaryLastSaleDate)} detail="Latest recorded transaction" />
        </div>

        <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_340px]">
          <section className="space-y-8">
            <div>
              <div className="mb-5">
                <p className="text-sm uppercase tracking-[0.18em] text-stone-500">Market prices</p>
                <h2 className="mt-2 text-3xl font-semibold tracking-tight text-stone-900">Prices and activity in {areaName}</h2>
                <p className="mt-3 max-w-3xl text-sm leading-6 text-stone-600">
                  Use these signals to understand local property prices, price change and recent market activity in {areaName}.
                </p>
              </div>
              <PprLocationInsights areaLabel={areaName} insights={insights} rangeLabel={analyticsRange.label} />
            </div>

            <div>
              <div className="mb-5">
                <p className="text-sm uppercase tracking-[0.18em] text-stone-500">Recent register entries</p>
                <h2 className="mt-2 text-3xl font-semibold tracking-tight text-stone-900">Latest sales in {areaName}</h2>
              </div>
              {recentSales.length > 0 ? (
                <div className="space-y-4">
                  {recentSales.map((sale) => <PprSaleCard key={sale.id} sale={sale} showAreaLink={false} />)}
                </div>
              ) : (
                <div className="rounded-[28px] border border-stone-200 bg-white p-8 text-stone-600 shadow-sm">
                  No recent sales are available for this area yet.
                </div>
              )}
            </div>

            <div className="rounded-[28px] border border-emerald-200 bg-emerald-50/70 p-6 sm:p-8">
              <p className="text-sm uppercase tracking-[0.18em] text-emerald-800">Development activity</p>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight text-stone-950">Check planning applications in {areaName}</h2>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-stone-600">
                Open the Planning search already filtered to this area to see current and historic applications without slowing down the sold-price page.
              </p>
              <Link href={planningHref} className="mt-5 inline-flex min-h-11 items-center rounded-full bg-stone-950 px-5 text-sm font-semibold text-white transition hover:bg-stone-700">
                View Planning in {areaName} →
              </Link>
            </div>
          </section>

          <aside className="space-y-5">
            <PprDisclaimer />
            <div className="rounded-[28px] border border-stone-200 bg-white p-6 shadow-sm">
              <p className="text-sm uppercase tracking-[0.18em] text-stone-500">Sold prices</p>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight text-stone-900">Compare this market</h2>
              <p className="mt-3 text-sm leading-6 text-stone-600">
                Continue into broader tracked views or the full {countyLabel} market.
              </p>
              <div className="mt-5 flex flex-wrap gap-3">
                <Link href={`/sold-prices/${decodedCounty.toLowerCase()}`} className="inline-flex rounded-full bg-stone-900 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-stone-700">
                  {countyLabel} prices
                </Link>
                {comparisonLinks.map((link) => (
                  <Link key={link.href} href={link.href} className="inline-flex rounded-full border border-stone-300 px-5 py-2.5 text-sm font-medium text-stone-700 transition hover:border-stone-900 hover:text-stone-900">
                    {link.label}
                  </Link>
                ))}
              </div>
            </div>
          </aside>
        </div>
      </section>
    </main>
  )
}

function MetricCard({
  label,
  value,
  detail,
  tone,
}: {
  label: string
  value: string
  detail: string
  tone?: number
}) {
  const valueClass = tone === undefined
    ? "text-stone-900"
    : tone > 0
      ? "text-emerald-700"
      : tone < 0
        ? "text-rose-700"
        : "text-stone-900"

  return (
    <div className="rounded-[24px] border border-stone-200 bg-white p-5 shadow-sm">
      <p className="text-sm text-stone-500">{label}</p>
      <p className={`mt-2 text-2xl font-semibold ${valueClass}`}>{value}</p>
      <p className="mt-2 text-xs leading-5 text-stone-500">{detail}</p>
    </div>
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
