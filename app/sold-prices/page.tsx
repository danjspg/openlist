import type { Metadata } from "next"
import Link from "@/components/RuntimeDataLink"
import PprDisclaimer from "@/components/ppr/PprDisclaimer"
import {
  areaNameFromSlug,
  formatPprCountyDisplayName,
  formatPprCurrency,
  formatPprDate,
  getPprDatasetSummary,
  getPprQuickAreas,
  type PprDateRangeValue,
} from "@/lib/ppr"
import { FEATURED_PPR_MARKETS, PPR_MARKETS, pprMarketLabel } from "@/lib/ppr-markets"
import { getShortTownRedirect } from "@/lib/ppr-sold-price-routes"
import {
  getAnalyticsRange,
  getHomepageSoldPriceStats,
  getNationalHomepageSnapshot,
  signedPercent,
} from "@/lib/ppr-analytics"

export const dynamic = "force-dynamic"

export const metadata: Metadata = {
  title: "Ireland House Prices | Sold Prices & Market Trends",
  description: "See recorded Irish sale prices, market trends and county comparisons from the Property Price Register.",
  alternates: { canonical: "/sold-prices" },
  robots: { index: true, follow: true },
}

export default async function SoldPricesPage() {
  const selectedRange: PprDateRangeValue = "last-year"
  const analyticsRange = getAnalyticsRange(selectedRange)
  const [datasetSummary, quickAreas, homepageStats, nationalPageModel] = await Promise.all([
    getPprDatasetSummary().catch(() => ({ salesCount: 0, earliestSaleDate: null, latestSaleDate: null, startYear: null })),
    getPprQuickAreas().catch(() => []),
    getHomepageSoldPriceStats().catch(() => []),
    getNationalHomepageSnapshot(),
  ])
  const nationalSnapshot = nationalPageModel.overview
  const monthlyActivity = nationalPageModel.activity

  const featuredMarkets = Array.from(new Set([
    ...FEATURED_PPR_MARKETS,
    "waterford", "naas", "carrigaline", "ballincollig", "oranmore", "castletroy", "tramore", "greystones", "galway", "limerick", "kinsale",
  ]))
    .map((slug) => PPR_MARKETS.find((market) => market.slug === slug))
    .filter((market): market is (typeof PPR_MARKETS)[number] => Boolean(market))
  const featuredMarketLinks = featuredMarkets
    .map((market) => {
      if (market.marketType !== "town_suburb") return { href: `/sold-prices/${market.slug}`, label: pprMarketLabel(market) }
      const redirectPath = getShortTownRedirect(market.slug)
      return redirectPath ? { href: redirectPath, label: pprMarketLabel(market) } : null
    })
    .filter((link): link is { href: string; label: string } => Boolean(link))

  const marketReportGroups = [
    {
      title: "Compare places",
      links: [
        ["/sold-prices/counties-compared", "Counties Compared"],
        ["/sold-prices/dublin-compared", "Dublin Market"],
        ["/sold-prices/cork-compared", "Cork Market"],
        ["/sold-prices/limerick-compared", "Limerick Market"],
        ["/sold-prices/galway-compared", "Galway Market"],
        ["/sold-prices/waterford-compared", "Waterford Market"],
        ["/sold-prices/commuter-towns", "Dublin Commuter Towns"],
      ],
    },
    {
      title: "Price & activity",
      links: [
        ["/sold-prices/affordable-markets", "Affordable Markets"],
        ["/sold-prices/high-value-markets", "Premium Markets"],
        ["/sold-prices/most-active-markets", "Most Active Markets"],
        ["/sold-prices/least-active-markets", "Least Active Markets"],
      ],
    },
    {
      title: "Trends",
      links: [
        ["/sold-prices/rising-markets", "Rising Markets"],
        ["/sold-prices/falling-markets", "Falling Markets"],
        ["/sold-prices/hottest-markets", "Hottest Markets"],
        ["/sold-prices/coolest-markets", "Coolest Markets"],
      ],
    },
  ] as const

  const risingSpotlight = homepageStats.find((stat) => stat.eyebrow === "Fastest-rising tracked market")
  const affordableSpotlight = homepageStats.find((stat) => stat.eyebrow === "Most affordable market")

  return (
    <main className="min-h-screen bg-stone-50">
      <section className="border-b border-stone-200 bg-white">
        <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 lg:py-14">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-stone-400">Public sold prices</p>
          <h1 className="mt-3 max-w-4xl text-4xl font-semibold tracking-tight text-stone-950 sm:text-5xl">
            House prices and sold prices across Ireland
          </h1>
          <p className="mt-4 max-w-3xl text-lg leading-8 text-stone-600">
            Search {new Intl.NumberFormat("en-IE").format(datasetSummary.salesCount)} recorded property sales, then compare local markets and recent trends.
          </p>
          <p className="mt-3 text-sm text-stone-500">
            {datasetSummary.latestSaleDate ? `Latest recorded sale: ${formatPprDate(datasetSummary.latestSaleDate)} · ` : ""}Source: Property Price Register
          </p>

          <div className="mt-7 rounded-2xl border border-stone-300 bg-stone-50 p-4 shadow-sm sm:flex sm:items-center sm:justify-between sm:gap-5 sm:p-5">
            <div>
              <p className="text-sm font-semibold text-stone-900">Start with an area</p>
              <p className="mt-1 text-sm leading-6 text-stone-600">Search a town, suburb or county to see recorded sales and local market context.</p>
            </div>
            <Link href="/sold-prices/search" className="mt-4 inline-flex min-h-12 items-center justify-center rounded-full bg-stone-950 px-6 text-sm font-semibold text-white transition hover:bg-stone-700 sm:mt-0">
              Search sold prices
            </Link>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:py-10">
        <section>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-400">Market snapshot</p>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight text-stone-950">Ireland at a glance</h2>
            </div>
            <p className="text-sm text-stone-500">{analyticsRange.label}</p>
          </div>
          <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <SnapshotCard label="Median sale price" value={formatPprCurrency(nationalSnapshot.medianPrice)} detail={nationalSnapshot.p25 !== undefined && nationalSnapshot.p75 !== undefined ? `Middle 50%: ${formatPprCurrency(nationalSnapshot.p25)} to ${formatPprCurrency(nationalSnapshot.p75)}` : "Recent recorded sales"} />
            <SnapshotCard label="Year-on-year price change" value={nationalSnapshot.yoyChangePct !== undefined ? signedPercent(nationalSnapshot.yoyChangePct) : "Limited data"} detail="Median sale price vs previous 12 months" tone={nationalSnapshot.yoyChangePct} />
            <SnapshotCard label="Sales activity" value={monthlyActivity.yoyChangePct !== undefined ? signedPercent(monthlyActivity.yoyChangePct) : "Limited data"} detail={`${monthlyActivity.currentPeriodLabel} vs ${monthlyActivity.previousPeriodLabel}`} tone={monthlyActivity.yoyChangePct} />
            <SnapshotCard label="Fastest-rising tracked market" value={risingSpotlight?.title || "Limited data"} detail={risingSpotlight ? `${risingSpotlight.value} year on year` : "Shown when enough data is available"} href={risingSpotlight?.titleHref} />
            <SnapshotCard label="Most affordable market" value={affordableSpotlight?.title || "Limited data"} detail={affordableSpotlight?.value !== "Limited data" ? `${affordableSpotlight?.value} median price` : affordableSpotlight?.detail || "Shown when enough data is available"} href={affordableSpotlight?.titleHref} />
            <SnapshotCard label="Recorded sales" value={new Intl.NumberFormat("en-IE").format(datasetSummary.salesCount)} detail="Available Property Price Register history" />
          </div>
        </section>

        <section className="mt-9 rounded-2xl border border-stone-200 bg-white p-5 shadow-sm sm:p-6">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-400">Explore markets</p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight text-stone-950">Compare places, prices and trends</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-stone-600">One place to browse the main market reports, instead of several competing entry points.</p>
          </div>
          <div className="mt-5 grid gap-4 lg:grid-cols-3">
            {marketReportGroups.map((group) => (
              <div key={group.title} className="rounded-2xl border border-stone-200 bg-stone-50 p-4">
                <p className="text-sm font-semibold text-stone-900">{group.title}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {group.links.map(([href, label]) => (
                    <Link key={href} href={href} className="inline-flex min-h-10 items-center rounded-full border border-stone-200 bg-white px-3 text-sm font-semibold text-stone-700 transition hover:border-stone-400 hover:text-stone-950">
                      {label}
                    </Link>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>

        <div className="mt-9 grid gap-8 lg:grid-cols-[minmax(0,1fr)_340px]">
          <section>
            <div className="flex items-end justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-400">Popular areas</p>
                <h2 className="mt-2 text-2xl font-semibold tracking-tight text-stone-950">Jump into a local market</h2>
              </div>
              <Link href="/sold-prices/counties-compared" className="text-sm font-semibold text-emerald-800 hover:text-emerald-950">Compare counties →</Link>
            </div>
            {quickAreas.length > 0 ? (
              <div className="mt-5 grid gap-4 sm:grid-cols-2">
                {quickAreas.map((area) => (
                  <Link key={`${area.county}-${area.area_slug}`} href={`/sold-prices/${encodeURIComponent(String(area.county || "").toLowerCase())}/${area.area_slug}`} className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-stone-300 hover:shadow-md">
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-stone-400">{formatPprCountyDisplayName(area.county)}</p>
                    <h3 className="mt-2 text-xl font-semibold tracking-tight text-stone-950">{areaNameFromSlug(area.area_slug || "")}</h3>
                    <p className="mt-3 text-sm text-stone-500">{area.sales_count || 0} sales · {formatPprCurrency(area.median_price_eur)} median</p>
                  </Link>
                ))}
              </div>
            ) : <p className="mt-5 rounded-2xl border border-stone-200 bg-white p-6 text-sm text-stone-600">Area links will appear once data is available.</p>}
          </section>

          <aside className="space-y-5">
            <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-400">Tracked markets</p>
              <div className="mt-4 flex flex-wrap gap-2">
                {featuredMarketLinks.map((market) => (
                  <Link key={market.href} href={market.href} className="inline-flex min-h-9 items-center rounded-full border border-stone-200 bg-stone-50 px-3 text-sm font-semibold text-stone-700 transition hover:border-stone-400 hover:bg-white">
                    {market.label}
                  </Link>
                ))}
              </div>
            </div>
            <PprDisclaimer compact />
          </aside>
        </div>
      </section>
    </main>
  )
}

function SnapshotCard({
  label,
  value,
  detail,
  tone,
  href,
}: {
  label: string
  value: string
  detail: string
  tone?: number
  href?: string
}) {
  const valueClass = tone === undefined ? "text-stone-950" : tone > 0 ? "text-emerald-700" : tone < 0 ? "text-rose-700" : "text-stone-950"
  const content = <span className={valueClass}>{value}</span>
  return (
    <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
      <p className="text-sm text-stone-500">{label}</p>
      <p className="mt-2 text-2xl font-semibold tracking-tight">
        {href ? <Link href={href} className="transition hover:text-emerald-800">{content}</Link> : content}
      </p>
      <p className="mt-2 text-sm leading-6 text-stone-500">{detail}</p>
    </div>
  )
}
