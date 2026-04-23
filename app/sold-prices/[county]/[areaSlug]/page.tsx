import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import PprDisclaimer from "@/components/ppr/PprDisclaimer"
import PprLocationInsights from "@/components/ppr/PprLocationInsights"
import PprSaleCard from "@/components/ppr/PprSaleCard"
import { getPprMarket, getRelevantMarketComparisonLinks } from "@/lib/ppr-markets"
import {
  areaNameFromSlug,
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

export const dynamic = "force-dynamic"

type Props = {
  params: Promise<{ county: string; areaSlug: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { county, areaSlug } = await params
  if (isExcludedStandaloneAreaSlug(areaSlug)) notFound()
  const decodedCounty = decodeURIComponent(county)
  const areaName = areaNameFromSlug(areaSlug)

  return {
    title: `${areaName} Property Prices | Recent Sales & Trends`,
    description: `See what homes are selling for in ${areaName}, ${decodedCounty}. View recent property sale prices, market trends and activity from recorded transactions.`,
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
  const areaName = areaNameFromSlug(areaSlug)
  const areaTitle = `${formatPprDisplayText(areaName).toUpperCase()} MARKET`
  const areaMarket = getPprMarket(areaSlug)
  const comparisonLinks = areaMarket
    ? getRelevantMarketComparisonLinks(areaMarket)
    : [
        { href: "/sold-prices/rising-markets", label: "Rising Markets" },
        { href: "/sold-prices/affordable-markets", label: "Affordable Markets" },
      ]

  const [areaData, nearbyAreas] = await Promise.all([
    getAreaInsights(decodedCounty, areaSlug, selectedRange),
    getNearbyAreaLinks(decodedCounty, areaSlug),
  ])
  const { insights, recentSales } = areaData

  return (
    <main className="min-h-screen bg-stone-50">
      <section className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
        <div className="overflow-hidden rounded-[32px] border border-stone-200 bg-white shadow-sm">
          <div className="bg-gradient-to-br from-stone-50 via-white to-stone-100 px-5 py-7 sm:px-8 md:px-10 md:py-10">
            <p className="text-sm font-medium uppercase tracking-[0.24em] text-stone-500">
              {areaTitle}
            </p>
            <h1 className="mt-2 text-4xl font-semibold tracking-tight text-stone-900 sm:text-5xl">
              Property prices in {areaName}, {decodedCounty}
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
                See {decodedCounty} house prices
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
            <p className="text-sm text-stone-500">Last sale</p>
            <p className="mt-2 text-2xl font-semibold text-stone-900">
              {formatPprDate(insights.lastSaleDate)}
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
                  activity in {areaName} against nearby parts of {decodedCounty}.
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
                    <PprSaleCard key={sale.id} sale={sale} />
                  ))}
                </div>
              ) : (
                <div className="rounded-[28px] border border-stone-200 bg-white p-8 text-stone-600 shadow-sm">
                  No recent sales are available for this area yet.
                </div>
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
