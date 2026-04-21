import type { Metadata } from "next"
import Link from "next/link"
import PprDisclaimer from "@/components/ppr/PprDisclaimer"
import PprMonthlyChart from "@/components/ppr/PprMonthlyChart"
import PprSaleCard from "@/components/ppr/PprSaleCard"
import PprSellConversion from "@/components/ppr/PprSellConversion"
import {
  areaNameFromSlug,
  formatPprCurrency,
  formatPprDate,
  getAreaMonthly,
  getAreaStats,
  getNearbyAreaLinks,
  getRecentAreaSales,
} from "@/lib/ppr"

export const dynamic = "force-dynamic"

type Props = {
  params: Promise<{ county: string; areaSlug: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { county, areaSlug } = await params
  const decodedCounty = decodeURIComponent(county)
  const areaName = areaNameFromSlug(areaSlug)

  return {
    title: `${areaName} Sold Prices, ${decodedCounty} | OpenList`,
    description: `Browse recent public Property Price Register sale prices for ${areaName}, ${decodedCounty}.`,
  }
}

export default async function PprAreaPage({ params }: Props) {
  const { county, areaSlug } = await params
  const decodedCounty = decodeURIComponent(county)
  const areaName = areaNameFromSlug(areaSlug)

  const [stats, monthly, recentSales, nearbyAreas] = await Promise.all([
    getAreaStats(decodedCounty, areaSlug),
    getAreaMonthly(decodedCounty, areaSlug),
    getRecentAreaSales(decodedCounty, areaSlug),
    getNearbyAreaLinks(decodedCounty, areaSlug),
  ])

  return (
    <main className="min-h-screen bg-stone-50">
      <section className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
        <div className="overflow-hidden rounded-[32px] border border-stone-200 bg-white shadow-sm">
          <div className="bg-gradient-to-br from-stone-50 via-white to-stone-100 px-5 py-7 sm:px-8 md:px-10 md:py-10">
            <p className="text-sm font-medium uppercase tracking-[0.24em] text-stone-500">
              Sold prices in {decodedCounty}
            </p>
            <h1 className="mt-2 text-4xl font-semibold tracking-tight text-stone-900 sm:text-5xl">
              {areaName} sold prices.
            </h1>
            <p className="mt-5 max-w-3xl text-base leading-7 text-stone-600 sm:text-lg sm:leading-8">
              Recent public property sales in {areaName}.
            </p>
            <p className="mt-4 text-sm font-medium text-stone-700">
              Based on publicly available Property Price Register data.
            </p>
          </div>
        </div>

        <div className="mt-8 grid gap-4 md:grid-cols-4">
          <div className="rounded-[24px] border border-stone-200 bg-white p-5 shadow-sm">
            <p className="text-sm text-stone-500">Sales</p>
            <p className="mt-2 text-3xl font-semibold text-stone-900">
              {stats?.sales_count ?? recentSales.length}
            </p>
          </div>
          <div className="rounded-[24px] border border-stone-200 bg-white p-5 shadow-sm">
            <p className="text-sm text-stone-500">Median price</p>
            <p className="mt-2 text-2xl font-semibold text-stone-900">
              {formatPprCurrency(stats?.median_price_eur)}
            </p>
          </div>
          <div className="rounded-[24px] border border-stone-200 bg-white p-5 shadow-sm">
            <p className="text-sm text-stone-500">Average price</p>
            <p className="mt-2 text-2xl font-semibold text-stone-900">
              {formatPprCurrency(stats?.avg_price_eur)}
            </p>
          </div>
          <div className="rounded-[24px] border border-stone-200 bg-white p-5 shadow-sm">
            <p className="text-sm text-stone-500">Last sale</p>
            <p className="mt-2 text-2xl font-semibold text-stone-900">
              {formatPprDate(stats?.last_sale_date)}
            </p>
          </div>
        </div>

        <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_340px]">
          <section className="space-y-8">
            <PprMonthlyChart monthly={monthly} />

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

            {nearbyAreas.length > 0 && (
              <div className="rounded-[28px] border border-stone-200 bg-white p-6 shadow-sm">
                <p className="text-sm uppercase tracking-[0.18em] text-stone-500">
                  Nearby areas
                </p>
                <div className="mt-4 space-y-3">
                  {nearbyAreas.map((area) => (
                    <Link
                      key={`${area.county}-${area.area_slug}`}
                      href={`/sold-prices/${encodeURIComponent(area.county || decodedCounty)}/${area.area_slug}`}
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

            <PprSellConversion theme="dark" />
          </aside>
        </div>
      </section>
    </main>
  )
}
