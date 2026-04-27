import type { Metadata } from "next"
import Link from "next/link"
import { notFound, permanentRedirect } from "next/navigation"
import PprLocationInsights from "@/components/ppr/PprLocationInsights"
import PprDisclaimer from "@/components/ppr/PprDisclaimer"
import PprSaleCard from "@/components/ppr/PprSaleCard"
import {
  PPR_MARKETS,
  getPprMarket,
  getRelevantMarketComparisonLinks,
  isCountyPprMarket,
  pprMarketLabel,
} from "@/lib/ppr-markets"
import {
  areaNameFromSlug,
  getCountyAreaLinks,
  formatPprCurrency,
  formatPprDisplayText,
  getPprDatasetSummary,
  type PprDateRangeValue,
} from "@/lib/ppr"
import { getShortTownRedirect } from "@/lib/ppr-sold-price-routes"
import {
  euroDisplay,
  getAnalyticsRange,
  getMarketInsights,
  numberDisplay,
  signedPercent,
} from "@/lib/ppr-analytics"

type Props = {
  params: Promise<{ county: string }>
}

export const dynamicParams = true
export const revalidate = 21600

export function generateStaticParams() {
  return PPR_MARKETS.filter((market) => market.marketType === "county").map((market) => ({
    county: market.slug,
  }))
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { county } = await params
  const market = getPprMarket(county)

  if (!market || market.marketType === "town_suburb") {
    return {
      title: "Sold House Prices | OpenList",
      robots: {
        index: false,
        follow: true,
      },
    }
  }

  const marketLabel = pprMarketLabel(market)
  const summary = await getPprDatasetSummary()
  const sinceText = summary.startYear ? ` since ${summary.startYear}` : ""

  return {
    title: `${marketLabel} House Prices | Sold Prices & Trends`,
    description: `See recent house prices in ${marketLabel}. View recorded sale prices, market activity and local trends using Property Price Register data${sinceText}.`,
    alternates: {
      canonical: `/sold-prices/${market.slug}`,
    },
    robots: {
      index: true,
      follow: true,
    },
  }
}

export default async function PprMarketPage({ params }: Props) {
  const { county } = await params
  const market = getPprMarket(county)

  if (!market || market.marketType === "town_suburb") {
    const redirectPath = getShortTownRedirect(county)
    if (redirectPath) permanentRedirect(redirectPath)
    notFound()
  }

  const selectedRange: PprDateRangeValue = "last-year"
  const analyticsRange = getAnalyticsRange(selectedRange)
  const [{ insights, recentSales }, countyAreas] = await Promise.all([
    getMarketInsights(market, selectedRange),
    getCountyAreaLinks(market.name),
  ])
  const marketLabel = pprMarketLabel(market)
  const marketTitle = `${formatPprDisplayText(marketLabel).toUpperCase()} MARKET`
  const marketHeading = isCountyPprMarket(market)
    ? `House prices in Co. ${market.name}`
    : `House prices in ${marketLabel}`
  const comparisonLinks = getRelevantMarketComparisonLinks(market)

  return (
    <main className="min-h-screen bg-stone-50">
      <section className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
        <div className="overflow-hidden rounded-[32px] border border-stone-200 bg-white shadow-sm">
          <div className="bg-gradient-to-br from-stone-50 via-white to-stone-100 px-5 py-7 sm:px-8 md:px-10 md:py-10">
            <p className="text-sm font-medium uppercase tracking-[0.24em] text-stone-500">
              {marketTitle}
            </p>
            <h1 className="mt-2 max-w-4xl text-[clamp(1.9rem,5vw,3rem)] font-semibold tracking-tight text-stone-900">
              {marketHeading}
            </h1>
            <p className="mt-5 max-w-3xl text-base leading-7 text-stone-600 sm:text-lg sm:leading-8">
              See recent sold house prices, market activity and recorded sales trends for {marketLabel}.
            </p>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-stone-600">
              This page uses publicly available Property Price Register data to show recent sale
              prices, pricing trends and local market movement across {marketLabel}.
            </p>
            <Link
              href="/sold-prices"
              className="mt-5 inline-flex text-sm font-medium text-stone-600 transition hover:text-stone-900"
            >
              Back to Ireland house prices
            </Link>
          </div>
        </div>

        <div className="mt-8 grid gap-4 md:grid-cols-4">
          <div className="rounded-[24px] border border-stone-200 bg-white p-5 shadow-sm">
            <p className="text-sm text-stone-500">Sales activity</p>
            <p
              className={`mt-2 text-3xl font-semibold ${
                insights.activity?.changePct !== undefined
                  ? insights.activity.changePct > 0
                    ? "text-emerald-700"
                    : insights.activity.changePct < 0
                      ? "text-rose-700"
                      : "text-stone-900"
                  : "text-stone-900"
              }`}
            >
              {insights.activity?.changePct !== undefined
                ? insights.activity.changePct > 0
                  ? `↑ ${signedPercent(insights.activity.changePct)}`
                  : insights.activity.changePct < 0
                    ? `↓ ${signedPercent(insights.activity.changePct)}`
                    : "No change"
                : "Limited data"}
            </p>
            <p className="mt-2 text-xs leading-5 text-stone-500">
              {insights.activity
                ? `${insights.activity.currentPeriodLabel} vs ${insights.activity.previousPeriodLabel}`
                : `Across ${analyticsRange.label}`}
            </p>
            <p className="text-xs leading-5 text-stone-500">
              {insights.activity
                ? `${numberDisplay(insights.activity.currentPeriodCount)} vs ${numberDisplay(insights.activity.previousPeriodCount)} recorded sales`
                : `Across ${analyticsRange.label}`}
            </p>
          </div>
          <div className="rounded-[24px] border border-stone-200 bg-white p-5 shadow-sm">
            <p className="text-sm text-stone-500">Median price</p>
            <p className="mt-2 text-2xl font-semibold text-stone-900">
              {euroDisplay(insights.momentum?.currentMedian || insights.medianAllTime)}
            </p>
            <p className="mt-2 text-xs leading-5 text-stone-500">
              {analyticsRange.helperText || `Across ${analyticsRange.label}`}
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
            <p className="text-sm text-stone-500">Recorded sales</p>
            <p className="mt-2 text-2xl font-semibold text-stone-900">
              {numberDisplay(insights.totalSalesCount)}
            </p>
            <p className="mt-2 text-xs leading-5 text-stone-500">
              Across {analyticsRange.label}
            </p>
          </div>
        </div>

        <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_340px]">
          <section>
            <div className="mb-8">
              <div className="mb-5">
                <p className="text-sm uppercase tracking-[0.18em] text-stone-500">
                  Market prices
                </p>
                <h2 className="mt-2 text-3xl font-semibold tracking-tight text-stone-900">
                  Prices and activity in {marketLabel}
                </h2>
                <p className="mt-3 max-w-3xl text-sm leading-6 text-stone-600">
                  These signals are based on recorded sale prices only. Comparisons are hidden where
                  sample sizes are too small to be useful.
                </p>
              </div>

              <PprLocationInsights
                areaLabel={marketLabel}
                insights={insights}
                rangeLabel={analyticsRange.label}
              />
            </div>

            <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-sm uppercase tracking-[0.18em] text-stone-500">
                  {numberDisplay(insights.totalSalesCount)} record
                  {insights.totalSalesCount === 1 ? "" : "s"}
                </p>
                <h2 className="mt-1 text-2xl font-semibold tracking-tight text-stone-900">
                  Recent sales
                </h2>
              </div>
              <p className="text-sm text-stone-500">
                Detailed sold-prices search is being updated.
              </p>
            </div>

            {recentSales.length > 0 ? (
              <div className="space-y-4">
                {recentSales.map((sale) => (
                  <PprSaleCard key={sale.id} sale={sale} />
                ))}
              </div>
            ) : (
              <div className="rounded-[28px] border border-stone-200 bg-white p-8 text-stone-600 shadow-sm">
                Recent sold prices will appear here once matching PPR records
                are available.
              </div>
            )}
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
                Use the comparison pages to see how {marketLabel} sits against other tracked markets,
                national pricing and recent recorded activity.
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

            {countyAreas.length > 0 && (
              <div className="rounded-[28px] border border-stone-200 bg-white p-6 shadow-sm">
                <p className="text-sm uppercase tracking-[0.18em] text-stone-500">
                  Other parts of {marketLabel}
                </p>
                <p className="mt-3 text-sm leading-6 text-stone-600">
                  Browse local property prices in the busiest areas within {marketLabel}.
                </p>
                <div className="mt-4 space-y-3">
                  {countyAreas.map((area) => (
                    <Link
                      key={`${area.county}-${area.area_slug}`}
                      href={`/sold-prices/${market.slug}/${area.area_slug}`}
                      className="block rounded-2xl border border-stone-200 bg-stone-50 px-4 py-3 transition hover:border-stone-300 hover:bg-white"
                    >
                      <p className="font-medium text-stone-900">
                        {areaNameFromSlug(area.area_slug || "")}
                      </p>
                      <p className="mt-1 text-sm text-stone-500">
                        {numberDisplay(area.sales_count ?? 0)} sales · {formatPprCurrency(area.median_price_eur)}
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
