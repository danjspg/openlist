import type { Metadata } from "next"
import Link from "next/link"
import PprDisclaimer from "@/components/ppr/PprDisclaimer"
import PprSaleCard from "@/components/ppr/PprSaleCard"
import SoldPricesSearchForm from "@/components/ppr/SoldPricesSearchForm"
import {
  formatPprDate,
  getPprSearchSummary,
  PPR_PAGE_SIZE,
  searchPprSales,
  withDefaultPprSearchFilters,
} from "@/lib/ppr"

export const dynamic = "force-dynamic"

export const metadata: Metadata = {
  title: "Search Sold Prices | OpenList",
  description:
    "Search Irish residential sale prices from public Property Price Register data.",
}

type SearchParams = {
  county?: string
  area?: string
  minPrice?: string
  maxPrice?: string
  dateFrom?: string
  dateTo?: string
  dateRange?: string
  sort?: string
  newBuild?: string
  propertyStyle?: string
  page?: string
}

function buildPageHref(params: SearchParams, page: number) {
  const next = new URLSearchParams()

  for (const [key, value] of Object.entries(params)) {
    if (value && key !== "page") next.set(key, value)
  }

  if (page > 1) next.set("page", String(page))
  return `/sold-prices/search?${next.toString()}`
}

export default async function SoldPricesSearchPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const params = withDefaultPprSearchFilters(await searchParams)
  const [{ sales, count, page, error }, summary] = await Promise.all([
    searchPprSales(params),
    getPprSearchSummary(params),
  ])
  const totalPages = Math.max(1, Math.ceil(count / PPR_PAGE_SIZE))

  return (
    <main className="min-h-screen bg-stone-50">
      <section className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
        <div className="mb-8 overflow-hidden rounded-[32px] border border-stone-200 bg-white shadow-sm">
          <div className="bg-gradient-to-br from-stone-50 via-white to-stone-100 px-5 py-7 sm:px-8">
            <p className="text-sm font-medium uppercase tracking-[0.24em] text-stone-500">
              Sold prices
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-stone-900 sm:text-4xl">
              Search public sale prices.
            </h1>
            <p className="mt-3 max-w-3xl text-base leading-7 text-stone-600">
              See what homes actually sold for across Ireland, then refine by
              town, county, sale date and price range.
            </p>
            <p className="mt-3 text-sm font-medium text-stone-700">
              See prices near your own home by searching your town, suburb or
              address.
            </p>
          </div>
          <div className="border-t border-stone-200 p-5 sm:p-6">
            <SoldPricesSearchForm defaults={params} compact />
          </div>
        </div>

        <div className="grid gap-8 lg:grid-cols-[1fr_340px]">
          <section>
            <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-sm uppercase tracking-[0.18em] text-stone-500">
                  {new Intl.NumberFormat("en-IE").format(count)} result
                  {count === 1 ? "" : "s"}
                </p>
                <h2 className="mt-1 text-2xl font-semibold tracking-tight text-stone-900">
                  Recent sales
                </h2>
              </div>
              <Link
                href="/sold-prices"
                className="text-sm font-medium text-stone-600 transition hover:text-stone-900"
              >
                Back to sold prices
              </Link>
            </div>

            <div className="mb-5 flex flex-wrap gap-3">
              <div className="rounded-full border border-stone-200 bg-white px-4 py-2 text-sm text-stone-600 shadow-sm">
                <span className="font-medium text-stone-900">
                  {new Intl.NumberFormat("en-IE").format(summary.count)}
                </span>{" "}
                results
              </div>
              <div className="rounded-full border border-stone-200 bg-white px-4 py-2 text-sm text-stone-600 shadow-sm">
                Latest matching sale{" "}
                <span className="font-medium text-stone-900">
                  {formatPprDate(summary.latestSaleDate)}
                </span>
              </div>
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
              <div className="rounded-[28px] border border-stone-200 bg-white p-8 text-center shadow-sm">
                <h2 className="text-2xl font-semibold tracking-tight text-stone-900">
                  No sales found
                </h2>
                <p className="mt-3 text-stone-600">
                  Try widening the area, price range or date filters.
                </p>
              </div>
            )}

            {totalPages > 1 && (
              <div className="mt-8 flex flex-wrap items-center gap-3">
                {page > 1 && (
                  <Link
                    href={buildPageHref(params, page - 1)}
                    className="rounded-full border border-stone-300 bg-white px-5 py-2.5 text-sm font-medium text-stone-700 transition hover:border-stone-900 hover:text-stone-900"
                  >
                    Previous
                  </Link>
                )}
                <span className="text-sm text-stone-500">
                  Page {page} of {totalPages}
                </span>
                {page < totalPages && (
                  <Link
                    href={buildPageHref(params, page + 1)}
                    className="rounded-full border border-stone-300 bg-white px-5 py-2.5 text-sm font-medium text-stone-700 transition hover:border-stone-900 hover:text-stone-900"
                  >
                    Next
                  </Link>
                )}
              </div>
            )}
          </section>

          <aside className="space-y-5">
            <PprDisclaimer />
            <div className="rounded-[28px] border border-stone-200 bg-white p-6 shadow-sm">
              <p className="text-sm uppercase tracking-[0.18em] text-stone-500">
                For sellers
              </p>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight text-stone-900">
                Turn market context into a better listing.
              </h2>
              <p className="mt-3 text-sm leading-6 text-stone-600">
                Recent sale prices can inform your expectations. OpenList helps
                you present the property clearly when it is time to sell.
              </p>
              <Link
                href="/sell"
                className="mt-5 inline-flex rounded-full bg-stone-900 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-stone-700"
              >
                Create a listing
              </Link>
            </div>
          </aside>
        </div>

        <section className="mt-10 rounded-[32px] border border-stone-200 bg-white p-6 shadow-sm sm:p-8">
          <p className="text-sm font-medium uppercase tracking-[0.2em] text-stone-500">
            Thinking of selling your property?
          </p>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight text-stone-900">
            Turn local sale prices into a more confident next step.
          </h2>
          <p className="mt-3 max-w-3xl text-base leading-7 text-stone-600">
            Use these recent sales to understand your local market, set a
            realistic price, and present your home effectively.
          </p>
          <Link
            href="/sell"
            className="mt-6 inline-flex rounded-full bg-stone-900 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-stone-700"
          >
            Create your listing
          </Link>
        </section>
      </section>
    </main>
  )
}
