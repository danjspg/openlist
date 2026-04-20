import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import PprDisclaimer from "@/components/ppr/PprDisclaimer"
import PprSaleCard from "@/components/ppr/PprSaleCard"
import PprSellConversion from "@/components/ppr/PprSellConversion"
import { PPR_MARKETS, getPprMarket } from "@/lib/ppr-markets"
import { getMarketSoldPrices } from "@/lib/ppr"

type Props = {
  params: Promise<{ county: string }>
}

export const dynamicParams = false

export function generateStaticParams() {
  return PPR_MARKETS.map((market) => ({
    county: market.slug,
  }))
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { county } = await params
  const market = getPprMarket(county)

  if (!market) {
    return {
      title: "Sold House Prices | OpenList",
    }
  }

  return {
    title: `Sold House Prices in ${market.name} | OpenList`,
    description: `Search recent sold house prices in ${market.name} using public Property Price Register data since 2015.`,
    alternates: {
      canonical: `/sold-prices/${market.slug}`,
    },
    robots: {
      index: true,
      follow: true,
    },
  }
}

function marketTypeLabel(marketType: string) {
  if (marketType === "county") return "County market"
  if (marketType === "dublin_district") return "Dublin district"
  return "Town and suburb market"
}

export default async function PprMarketPage({ params }: Props) {
  const { county } = await params
  const market = getPprMarket(county)

  if (!market) notFound()

  const { sales, count, error } = await getMarketSoldPrices(market)
  const searchHref = `/sold-prices/search?area=${encodeURIComponent(market.name)}&sort=newest&dateRange=all`

  return (
    <main className="min-h-screen bg-stone-50">
      <section className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
        <div className="overflow-hidden rounded-[32px] border border-stone-200 bg-white shadow-sm">
          <div className="bg-gradient-to-br from-stone-50 via-white to-stone-100 px-5 py-7 sm:px-8 md:px-10 md:py-10">
            <p className="text-sm font-medium uppercase tracking-[0.24em] text-stone-500">
              {marketTypeLabel(market.marketType)}
            </p>
            <h1 className="mt-2 max-w-4xl text-4xl font-semibold tracking-tight text-stone-900 sm:text-5xl">
              See what homes sold for in {market.name}
            </h1>
            <p className="mt-5 max-w-3xl text-base leading-7 text-stone-600 sm:text-lg sm:leading-8">
              Use recent sale prices to understand your local market before deciding how to present your home.
            </p>
            <p className="mt-4 text-sm font-medium text-stone-700">
              Based on public Property Price Register data since 2015.
            </p>
            <Link
              href="/sold-prices"
              className="mt-5 inline-flex text-sm font-medium text-stone-600 transition hover:text-stone-900"
            >
              Back to Sold Prices
            </Link>
          </div>
        </div>

        <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_340px]">
          <section>
            <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-sm uppercase tracking-[0.18em] text-stone-500">
                  {new Intl.NumberFormat("en-IE").format(count)} record
                  {count === 1 ? "" : "s"}
                </p>
                <h2 className="mt-1 text-2xl font-semibold tracking-tight text-stone-900">
                  Recent sales
                </h2>
              </div>
              <Link
                href={searchHref}
                className="text-sm font-medium text-stone-600 transition hover:text-stone-900"
              >
                Refine this search
              </Link>
            </div>

            {error ? (
              <div className="rounded-[28px] border border-red-200 bg-red-50 p-6 text-red-700">
                Could not load sold prices: {error}
              </div>
            ) : sales.length > 0 ? (
              <div className="space-y-4">
                {sales.map((sale) => (
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
                Search across Ireland.
              </h2>
              <p className="mt-3 text-sm leading-6 text-stone-600">
                Compare recent sale prices by area, county, sale date and price
                range using public PPR records.
              </p>
              <Link
                href="/sold-prices"
                className="mt-5 inline-flex rounded-full bg-stone-900 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-stone-700"
              >
                Back to sold prices
              </Link>
            </div>
            <PprSellConversion />
          </aside>
        </div>
      </section>
    </main>
  )
}
