import type { Metadata } from "next"
import Link from "next/link"
import PprDisclaimer from "@/components/ppr/PprDisclaimer"
import SoldPricesSearchForm from "@/components/ppr/SoldPricesSearchForm"
import {
  areaNameFromSlug,
  formatPprCurrency,
  formatPprDate,
  getPprKpis,
  getPprQuickAreas,
} from "@/lib/ppr"

export const dynamic = "force-dynamic"

export const metadata: Metadata = {
  title: "Sold Prices Ireland | OpenList",
  description:
    "Browse recent Irish residential sold prices using public Property Price Register data.",
}

export default async function SoldPricesPage() {
  const [kpis, quickAreas] = await Promise.all([
    getPprKpis(),
    getPprQuickAreas(),
  ])

  return (
    <main className="min-h-screen bg-stone-50">
      <section className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-12">
        <div className="overflow-hidden rounded-[32px] border border-stone-200 bg-white shadow-sm">
          <div className="bg-gradient-to-br from-stone-50 via-white to-stone-100 px-5 py-8 sm:px-8 md:px-10 md:py-12">
            <p className="text-sm font-medium uppercase tracking-[0.24em] text-stone-500">
              Public sold prices
            </p>
            <h1 className="mt-3 max-w-4xl text-4xl font-semibold tracking-tight text-stone-900 sm:text-5xl">
              Recent residential sale prices across Ireland.
            </h1>
            <p className="mt-5 max-w-3xl text-base leading-7 text-stone-600 sm:text-lg sm:leading-8">
              Browse public Property Price Register records by county, area and
              price range. Use recent sales as useful market context before you
              decide how to present your own property.
            </p>
          </div>

          <div className="border-t border-stone-200 p-5 sm:p-6 md:p-8">
            <SoldPricesSearchForm />
          </div>
        </div>

        <div className="mt-8 grid gap-4 md:grid-cols-4">
          <div className="rounded-[24px] border border-stone-200 bg-white p-5 shadow-sm">
            <p className="text-sm text-stone-500">Sales indexed</p>
            <p className="mt-2 text-3xl font-semibold text-stone-900">
              {new Intl.NumberFormat("en-IE").format(kpis.salesCount)}
            </p>
          </div>
          <div className="rounded-[24px] border border-stone-200 bg-white p-5 shadow-sm">
            <p className="text-sm text-stone-500">Counties</p>
            <p className="mt-2 text-3xl font-semibold text-stone-900">
              {kpis.countyCount || "—"}
            </p>
          </div>
          <div className="rounded-[24px] border border-stone-200 bg-white p-5 shadow-sm">
            <p className="text-sm text-stone-500">Latest sale</p>
            <p className="mt-2 text-2xl font-semibold text-stone-900">
              {formatPprDate(kpis.latestSaleDate)}
            </p>
          </div>
          <div className="rounded-[24px] border border-stone-200 bg-white p-5 shadow-sm">
            <p className="text-sm text-stone-500">Latest price</p>
            <p className="mt-2 text-2xl font-semibold text-stone-900">
              {formatPprCurrency(kpis.latestSalePrice)}
            </p>
          </div>
        </div>

        <div className="mt-10 grid gap-8 lg:grid-cols-[1fr_360px]">
          <section>
            <div className="flex items-end justify-between gap-4">
              <div>
                <p className="text-sm font-medium uppercase tracking-[0.2em] text-stone-500">
                  Quick areas
                </p>
                <h2 className="mt-2 text-3xl font-semibold tracking-tight text-stone-900">
                  Explore active local markets.
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
            <div className="rounded-[28px] bg-stone-900 p-6 text-white shadow-sm">
              <p className="text-sm uppercase tracking-[0.2em] text-stone-300">
                Thinking of selling?
              </p>
              <h2 className="mt-3 text-2xl font-semibold tracking-tight">
                Present your property with more care.
              </h2>
              <p className="mt-3 text-sm leading-6 text-stone-300">
                Sold prices give context. A clear, thoughtful listing helps
                buyers understand what makes your property different.
              </p>
              <Link
                href="/sell"
                className="mt-6 inline-flex rounded-full bg-white px-5 py-2.5 text-sm font-medium text-stone-900 transition hover:bg-stone-200"
              >
                Create a listing
              </Link>
            </div>
          </aside>
        </div>
      </section>
    </main>
  )
}
