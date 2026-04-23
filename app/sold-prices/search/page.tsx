import type { Metadata } from "next"
import Link from "next/link"
import PprDisclaimer from "@/components/ppr/PprDisclaimer"

export const dynamic = "force-dynamic"

export const metadata: Metadata = {
  title: "Sold Prices Search Updating | OpenList",
  description:
    "Detailed sold-prices search is being updated. Browse counties, tracked markets and comparison pages in the meantime.",
  robots: {
    index: false,
    follow: true,
  },
}

export default async function SoldPricesSearchPage() {
  return (
    <main className="min-h-screen bg-stone-50">
      <section className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
        <div className="mb-8 overflow-hidden rounded-[32px] border border-stone-200 bg-white shadow-sm">
          <div className="bg-gradient-to-br from-stone-50 via-white to-stone-100 px-5 py-7 sm:px-8">
            <p className="text-sm font-medium uppercase tracking-[0.24em] text-stone-500">
              Sold prices
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-stone-900 sm:text-4xl">
              Detailed sold-prices search is being updated
            </h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-stone-700">
              Filtered search will return shortly. For now, browse counties, tracked markets and
              comparison pages to explore the latest sold-prices data.
            </p>
          </div>
          <div className="border-t border-stone-200 p-5 sm:p-6">
            <div className="grid gap-4 sm:grid-cols-3">
              <Link
                href="/sold-prices"
                className="rounded-[24px] border border-stone-200 bg-stone-50 px-5 py-5 transition hover:border-stone-300 hover:bg-white"
              >
                <p className="text-sm text-stone-500">Sold prices hub</p>
                <p className="mt-2 text-xl font-semibold tracking-tight text-stone-900">
                  Back to sold prices
                </p>
                <p className="mt-2 text-sm leading-6 text-stone-600">
                  Use the landing page to browse quick areas and tracked markets.
                </p>
              </Link>
              <Link
                href="/sold-prices/dublin-compared"
                className="rounded-[24px] border border-stone-200 bg-stone-50 px-5 py-5 transition hover:border-stone-300 hover:bg-white"
              >
                <p className="text-sm text-stone-500">Compare tracked markets</p>
                <p className="mt-2 text-xl font-semibold tracking-tight text-stone-900">
                  See how areas stack up
                </p>
                <p className="mt-2 text-sm leading-6 text-stone-600">
                  Jump into Dublin, commuter towns, affordable markets and more.
                </p>
              </Link>
              <Link
                href="/sold-prices/dublin"
                className="rounded-[24px] border border-stone-200 bg-stone-50 px-5 py-5 transition hover:border-stone-300 hover:bg-white"
              >
                <p className="text-sm text-stone-500">Browse counties</p>
                <p className="mt-2 text-xl font-semibold tracking-tight text-stone-900">
                  Start with county pages
                </p>
                <p className="mt-2 text-sm leading-6 text-stone-600">
                  Explore county-level market pages and drill into popular areas.
                </p>
              </Link>
            </div>
          </div>
        </div>

        <div className="grid gap-8 lg:grid-cols-[1fr_340px]">
          <section>
            <div className="rounded-[28px] border border-stone-200 bg-white p-8 shadow-sm">
              <h2 className="text-2xl font-semibold tracking-tight text-stone-900">
                Browse while search is offline
              </h2>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-stone-600">
                The sold-prices comparisons and county pages remain live and up to date. Use those
                routes for now while the heavier filtered search flow is being improved.
              </p>
            </div>
          </section>

          <aside className="space-y-5">
            <PprDisclaimer />
          </aside>
        </div>
      </section>
    </main>
  )
}
