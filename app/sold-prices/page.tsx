import type { Metadata } from "next"
import Link from "next/link"
import PprDisclaimer from "@/components/ppr/PprDisclaimer"
import PprSaleCard from "@/components/ppr/PprSaleCard"
import SoldPricesSearchForm from "@/components/ppr/SoldPricesSearchForm"
import {
  getPprDateRangePreset,
  areaNameFromSlug,
  buildPprDatasetDescription,
  formatPprCurrency,
  formatPprDate,
  getDefaultPprDateRange,
  getPprDatasetSummary,
  getPprKpis,
  getPprQuickAreas,
  getPprSearchSummary,
  searchPprSales,
  type PprDateRangeValue,
} from "@/lib/ppr"
import { FEATURED_PPR_MARKETS, PPR_MARKETS, pprMarketLabel } from "@/lib/ppr-markets"
import {
  getAnalyticsRange,
  getHomepageSoldPriceStats,
  getNationalActivitySnapshot,
  getNationalOverviewSnapshot,
  signedPercent,
} from "@/lib/ppr-analytics"

export const dynamic = "force-dynamic"

export async function generateMetadata(): Promise<Metadata> {
  const summary = await getPprDatasetSummary()

  return {
    title: "Sold Prices Ireland | OpenList",
    description: buildPprDatasetDescription(summary),
  }
}

export default async function SoldPricesPage({
  searchParams,
}: {
  searchParams?: Promise<{ dateRange?: string }>
}) {
  const resolvedSearchParams: { dateRange?: string } =
    await (searchParams || Promise.resolve({}))
  const selectedRange = (resolvedSearchParams.dateRange || "last-year") as PprDateRangeValue
  const selectedPreset = getPprDateRangePreset(selectedRange)
  const analyticsRange = getAnalyticsRange(selectedRange)
  const defaultSearch =
    selectedRange === "last-year" ? getDefaultPprDateRange() : selectedPreset
  const [kpis, quickAreas, recentResults, recentResultsSummary, monthlyActivity, homepageStats] = await Promise.all([
    getPprKpis(),
    getPprQuickAreas(),
    searchPprSales(defaultSearch),
    getPprSearchSummary(defaultSearch),
    getNationalActivitySnapshot(),
    getHomepageSoldPriceStats(),
  ])
  const [nationalSnapshotSettled] = await Promise.allSettled([getNationalOverviewSnapshot(selectedRange)])
  const nationalSnapshot =
    nationalSnapshotSettled.status === "fulfilled"
      ? nationalSnapshotSettled.value
      : { salesCount: 0 }
  const recentResultsCount = Math.max(recentResultsSummary.count, recentResults.sales.length)
  const featuredMarkets = Array.from(
    new Set([
      ...FEATURED_PPR_MARKETS,
      "waterford",
      "naas",
      "carrigaline",
      "ballincollig",
      "oranmore",
      "castletroy",
      "tramore",
      "greystones",
      "galway",
      "limerick",
      "kinsale",
    ])
  )
    .map((slug) => PPR_MARKETS.find((market) => market.slug === slug))
    .filter((market): market is (typeof PPR_MARKETS)[number] => Boolean(market))
  const exploreMarketLinks = [
    { href: "/sold-prices/dublin-compared", label: "Dublin Market" },
    { href: "/sold-prices/commuter-towns", label: "Dublin Commuter Towns" },
    { href: "/sold-prices/cork-compared", label: "Cork Market" },
    { href: "/sold-prices/limerick-compared", label: "Limerick Market" },
    { href: "/sold-prices/galway-compared", label: "Galway Market" },
    { href: "/sold-prices/waterford-compared", label: "Waterford Market" },
    { href: "/sold-prices/affordable-markets", label: "Affordable Markets" },
    { href: "/sold-prices/high-value-markets", label: "Premium Markets" },
    { href: "/sold-prices/rising-markets", label: "Rising Markets" },
    { href: "/sold-prices/falling-markets", label: "Falling Markets" },
  ]
  const spreadLine =
    nationalSnapshot.p25 !== undefined && nationalSnapshot.p75 !== undefined
      ? `Most homes sold between ${formatPprCurrency(nationalSnapshot.p25)} and ${formatPprCurrency(
          nationalSnapshot.p75
        )}.`
      : null
  const risingSpotlight = homepageStats.find(
    (stat) => stat.eyebrow === "Fastest-rising tracked market"
  )

  return (
    <main className="min-h-screen bg-stone-50">
      <section className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-12">
        <div className="overflow-hidden rounded-[32px] border border-stone-200 bg-white shadow-sm">
          <div className="bg-gradient-to-br from-stone-50 via-white to-stone-100 px-5 py-8 sm:px-8 md:px-10 md:py-12">
            <p className="text-sm font-medium uppercase tracking-[0.24em] text-stone-500">
              PUBLIC SOLD PRICES
            </p>
            <h1 className="mt-3 max-w-4xl text-4xl font-semibold tracking-tight text-stone-900 sm:text-5xl">
              See what homes sold for across Ireland
            </h1>
            <p className="mt-5 max-w-3xl whitespace-pre-line text-base leading-7 text-stone-600 sm:text-lg sm:leading-8">
              Search over {new Intl.NumberFormat("en-IE").format(kpis.salesCount)} property
              sales to see what homes are really selling for.
            </p>
            <p className="mt-4 text-sm font-medium text-stone-700">
              Explore real sale prices across Ireland and understand your local market.
            </p>
            <p className="mt-3 text-sm text-stone-600">
              Based on publicly available Property Price Register data.
            </p>
          </div>
        </div>

        <div className="mt-6 grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="rounded-[28px] border border-stone-200 bg-white p-5 shadow-sm sm:p-6">
            <p className="text-sm font-medium uppercase tracking-[0.2em] text-stone-500">
              Market snapshot
            </p>
            <p className="mt-2 text-sm text-stone-600">Showing data for: {analyticsRange.label}</p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className="rounded-[24px] border border-stone-200 bg-white px-5 py-5">
                <p className="text-sm text-stone-500">Median sale price</p>
                <p className="mt-3 text-3xl font-semibold tracking-tight text-stone-900">
                  {formatPprCurrency(nationalSnapshot.medianPrice)}
                </p>
                {spreadLine && <p className="mt-2 text-sm leading-6 text-stone-600">{spreadLine}</p>}
              </div>
              <div className="rounded-[24px] border border-stone-200 bg-white px-5 py-5">
                <p className="text-sm text-stone-500">Year-on-year price change</p>
                <p
                  className={`mt-3 text-3xl font-semibold tracking-tight ${
                    nationalSnapshot.yoyChangePct !== undefined
                      ? nationalSnapshot.yoyChangePct > 0
                        ? "text-emerald-700"
                        : nationalSnapshot.yoyChangePct < 0
                          ? "text-rose-700"
                          : "text-stone-900"
                      : "text-stone-900"
                  }`}
                >
                  {nationalSnapshot.yoyChangePct !== undefined
                    ? nationalSnapshot.yoyChangePct > 0
                      ? `↑ ${signedPercent(nationalSnapshot.yoyChangePct)}`
                      : nationalSnapshot.yoyChangePct < 0
                        ? `↓ ${signedPercent(nationalSnapshot.yoyChangePct)}`
                        : "No change"
                    : "Limited data"}
                </p>
                <p className="mt-2 text-sm leading-6 text-stone-600">
                  {nationalSnapshot.yoyChangePct !== undefined
                    ? "Median sale price vs the previous 12 months"
                    : "Shown when both 12-month periods have enough sales"}
                </p>
              </div>
            </div>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <div className="rounded-[22px] border border-stone-200 bg-stone-50 px-4 py-4">
                <p className="text-sm text-stone-500">Sales activity</p>
                <p
                  className={`mt-2 text-2xl font-semibold tracking-tight ${
                    monthlyActivity.yoyChangePct !== undefined
                      ? monthlyActivity.yoyChangePct > 0
                        ? "text-emerald-700"
                        : monthlyActivity.yoyChangePct < 0
                          ? "text-rose-700"
                          : "text-stone-900"
                      : "text-stone-900"
                  }`}
                >
                  {monthlyActivity.yoyChangePct !== undefined
                    ? `${monthlyActivity.yoyChangePct > 0 ? "↑ " : monthlyActivity.yoyChangePct < 0 ? "↓ " : ""}${signedPercent(monthlyActivity.yoyChangePct)}`
                    : "Limited data"}
                </p>
                <p className="mt-2 text-sm leading-6 text-stone-600">
                  {monthlyActivity.currentPeriodLabel} vs {monthlyActivity.previousPeriodLabel}
                </p>
                <p className="text-xs leading-5 text-stone-500">
                  {new Intl.NumberFormat("en-IE").format(monthlyActivity.currentCount)} vs{" "}
                  {new Intl.NumberFormat("en-IE").format(monthlyActivity.previousCount)} recorded sales
                </p>
              </div>
              <div className="rounded-[22px] border border-stone-200 bg-stone-50 px-4 py-4">
                <p className="text-sm text-stone-500">Fastest-rising market</p>
                <p className="mt-2 text-2xl font-semibold tracking-tight text-stone-900">
                  {risingSpotlight?.title || "—"}
                </p>
                <p className="mt-2 text-sm font-medium leading-6 text-stone-600">
                  {risingSpotlight
                    ? `${risingSpotlight.value} year on year.`
                    : "Shown when enough recent sales data is available."}
                </p>
              </div>
            </div>
            <div className="mt-4 space-y-1 text-sm leading-6 text-stone-600">
              <p>
                Based on {new Intl.NumberFormat("en-IE").format(kpis.salesCount)} recorded sales
                {kpis.startYear ? ` since ${kpis.startYear}` : ""}.
              </p>
              <p>Latest sale: {formatPprDate(kpis.latestSaleDate)}.</p>
            </div>
          </div>

          <div className="rounded-[28px] border border-stone-200 bg-stone-50/70 p-5 sm:p-6">
            <p className="text-sm font-medium uppercase tracking-[0.2em] text-stone-500">
              Explore Markets
            </p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {exploreMarketLinks.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="flex min-h-11 items-center rounded-2xl border border-stone-200 bg-white px-4 py-3 text-sm font-medium text-stone-700 transition hover:border-stone-300 hover:text-stone-900"
                >
                  {item.label}
                </Link>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-6 rounded-[32px] border border-stone-200 bg-white p-5 shadow-sm sm:p-6 md:p-8">
          <SoldPricesSearchForm defaults={defaultSearch} />
          <p className="mt-4 text-sm text-stone-600">
            See prices near your own home by searching your town, suburb or
            address.
          </p>
        </div>

        <div className="mt-10 grid gap-8 lg:grid-cols-[1fr_360px]">
          <section>
            <div className="mb-8">
              <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <p className="text-sm font-medium uppercase tracking-[0.2em] text-stone-500">
                    Recent sales
                  </p>
                  <p className="mt-2 text-sm leading-6 text-stone-500">
                    Sold prices shown are for general information only and are
                    not a valuation.
                  </p>
                  <h2 className="mt-2 text-3xl font-semibold tracking-tight text-stone-900">
                    Latest sold prices.
                  </h2>
                  <p className="mt-2 text-sm text-stone-500">
                    {new Intl.NumberFormat("en-IE").format(recentResultsCount)}{" "}
                    result{recentResultsCount === 1 ? "" : "s"} across {analyticsRange.label}
                  </p>
                </div>
                <Link
                  href={`/sold-prices/search?${new URLSearchParams(
                    defaultSearch.dateRange === "all"
                      ? { dateRange: "all", sort: "newest" }
                      : {
                          dateFrom: defaultSearch.dateFrom || "",
                          dateTo: defaultSearch.dateTo || "",
                          dateRange: defaultSearch.dateRange || "last-year",
                          sort: "newest",
                        }
                  ).toString()}`}
                  className="text-sm font-medium text-stone-600 transition hover:text-stone-900"
                >
                  View all results
                </Link>
              </div>

              {recentResults.error ? (
                <div className="rounded-[28px] border border-red-200 bg-red-50 p-6 text-red-700">
                  Could not load recent sold prices: {recentResults.error}
                </div>
              ) : recentResults.sales.length > 0 ? (
                <div className="space-y-4">
                  {recentResults.sales.map((sale) => (
                    <PprSaleCard key={sale.id} sale={sale} />
                  ))}
                </div>
              ) : (
                <div className="rounded-[28px] border border-stone-200 bg-white p-8 text-stone-600 shadow-sm">
                  Recent sold prices will appear here once matching PPR records
                  are available.
                </div>
              )}
            </div>

            <div className="flex items-end justify-between gap-4">
              <div>
                <p className="text-sm font-medium uppercase tracking-[0.2em] text-stone-500">
                  Quick areas
                </p>
                <h2 className="mt-2 text-3xl font-semibold tracking-tight text-stone-900">
                  Popular areas
                </h2>
              </div>
            </div>

            {quickAreas.length > 0 ? (
              <div className="mt-6 grid gap-4 sm:grid-cols-2">
                {quickAreas.map((area) => (
                  <Link
                    key={`${area.county}-${area.area_slug}`}
                    href={`/sold-prices/${encodeURIComponent(area.county || "")}/${area.area_slug}`}
                    className="rounded-[24px] border border-stone-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
                  >
                    <p className="text-sm uppercase tracking-[0.18em] text-stone-500">
                      {area.county}
                    </p>
                    <h3 className="mt-2 text-2xl font-semibold tracking-tight text-stone-900">
                      {areaNameFromSlug(area.area_slug || "")}
                    </h3>
                    <div className="mt-4 flex flex-wrap gap-2 text-sm text-stone-600">
                      <span>{area.sales_count || 0} sales</span>
                      <span>·</span>
                      <span>{formatPprCurrency(area.median_price_eur)} median</span>
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="mt-6 rounded-[28px] border border-stone-200 bg-white p-8 text-stone-600 shadow-sm">
                Area links will appear once Property Price Register data has
                been ingested.
              </div>
            )}

          </section>

          <aside className="space-y-5">
            <PprDisclaimer />
            <div className="rounded-[24px] border border-stone-200 bg-white p-5 shadow-sm">
              <p className="text-sm font-medium uppercase tracking-[0.2em] text-stone-500">
                Popular markets
              </p>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight text-stone-900">
                Tracked markets
              </h2>
              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                {featuredMarkets.map((market) => (
                  <Link
                    key={market.slug}
                    href={`/sold-prices/${market.slug}`}
                    className="rounded-2xl border border-stone-200 bg-stone-50 px-4 py-3 text-sm font-medium text-stone-700 transition hover:border-stone-300 hover:bg-white hover:text-stone-900"
                  >
                    {pprMarketLabel(market)}
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
