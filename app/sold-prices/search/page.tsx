import type { Metadata } from "next"
import Link from "next/link"
import PprDisclaimer from "@/components/ppr/PprDisclaimer"
import PprSaleCard from "@/components/ppr/PprSaleCard"
import SoldPricesSearchForm from "@/components/ppr/SoldPricesSearchForm"
import {
  formatPprDate,
  getPprSearchScope,
  searchPprSales,
  type PprDateRangeValue,
  type PprSearchFilters,
} from "@/lib/ppr"

export const dynamic = "force-dynamic"

export const metadata: Metadata = {
  title: "Find Sales By Area | OpenList",
  description: "Choose an area to search recorded sale prices.",
}

type SearchParams = {
  county?: string
  areaSlug?: string
  areaLabel?: string
  minPrice?: string
  maxPrice?: string
  dateFrom?: string
  dateTo?: string
  dateRange?: string
  sort?: string
  newBuild?: string
  page?: string
}

export default async function SoldPricesSearchPage({
  searchParams,
}: {
  searchParams?: Promise<SearchParams>
}) {
  const resolvedSearchParams: SearchParams = await (searchParams || Promise.resolve({}))
  const filters: PprSearchFilters = {
    county: resolvedSearchParams.county,
    areaSlug: resolvedSearchParams.areaSlug,
    areaLabel: resolvedSearchParams.areaLabel,
    minPrice: resolvedSearchParams.minPrice,
    maxPrice: resolvedSearchParams.maxPrice,
    dateFrom: resolvedSearchParams.dateFrom,
    dateTo: resolvedSearchParams.dateTo,
    dateRange: resolvedSearchParams.dateRange,
    sort: resolvedSearchParams.sort,
    newBuild: resolvedSearchParams.newBuild,
    page: resolvedSearchParams.page,
  }
  const hasAttemptedSearch = Boolean(
    resolvedSearchParams.county || resolvedSearchParams.areaSlug || resolvedSearchParams.areaLabel
  )
  const scope = await getPprSearchScope(filters)
  const validationMessage =
    hasAttemptedSearch && !scope
      ? "Please choose an area from the list."
      : ""
  const results = scope ? await searchPprSales(filters) : null
  const selectedRange = (filters.dateRange || "last-2-years") as PprDateRangeValue
  const rangeLabel =
    selectedRange === "last-year"
      ? "last 12 months"
      : selectedRange === "last-5-years"
        ? "last 5 years"
        : "last 2 years"

  return (
    <main className="min-h-screen bg-stone-50">
      <section className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
        <div className="mb-8 rounded-[32px] border border-stone-200 bg-white shadow-sm">
          <div className="bg-gradient-to-br from-stone-50 via-white to-stone-100 px-5 py-7 sm:px-8">
            <p className="text-sm font-medium uppercase tracking-[0.24em] text-stone-500">
              Sold prices
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-stone-900 sm:text-4xl">
              Find sales by area
            </h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-stone-700">
              Choose an area to search recorded sale prices.
            </p>
          </div>
          <div className="border-t border-stone-200 p-5 sm:p-6">
            <SoldPricesSearchForm
              action="/sold-prices/search"
              defaults={filters}
              validationMessage={validationMessage}
            />
          </div>
        </div>

        <div className="grid gap-8">
          <section>
            <div className="rounded-[28px] border border-stone-200 bg-white p-8 shadow-sm">
              {!scope ? (
                <>
                  <h2 className="text-2xl font-semibold tracking-tight text-stone-900">
                    Pick an area to begin
                  </h2>
                  <p className="mt-3 max-w-3xl text-sm leading-6 text-stone-600">
                    Choose an area from the suggestions above to see recent recorded sale prices.
                  </p>
                </>
              ) : (
                <>
                  <p className="text-sm font-medium uppercase tracking-[0.2em] text-stone-500">
                    {scope.county}
                  </p>
                  <h2 className="mt-2 text-2xl font-semibold tracking-tight text-stone-900">
                    {scope.areaLabel} sales
                  </h2>
                  <p className="mt-3 max-w-3xl text-sm leading-6 text-stone-600">
                    {`Showing up to 100 recorded sales from the ${rangeLabel}.`}
                    {results?.sales?.[0]?.date_of_sale
                      ? ` Latest sale shown: ${formatPprDate(results.sales[0].date_of_sale)}.`
                      : ""}
                  </p>
                  <div className="mt-5 flex flex-wrap gap-3">
                    <Link
                      href={`/sold-prices/${encodeURIComponent(scope.county.toLowerCase())}/${scope.areaSlug}`}
                      className="inline-flex rounded-full bg-stone-900 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-stone-700"
                    >
                      Open area page
                    </Link>
                    <Link
                      href={`/sold-prices/${encodeURIComponent(scope.county.toLowerCase())}`}
                      className="inline-flex rounded-full border border-stone-300 px-5 py-2.5 text-sm font-medium text-stone-700 transition hover:border-stone-900 hover:text-stone-900"
                    >
                      See {scope.county} market
                    </Link>
                  </div>
                </>
              )}
            </div>

            {scope && results && (
              <div className="mt-6 space-y-4">
                {results.sales.length > 0 ? (
                  results.sales.map((sale) => <PprSaleCard key={sale.id} sale={sale} />)
                ) : (
                  <div className="rounded-[28px] border border-stone-200 bg-white p-8 text-stone-600 shadow-sm">
                    No recorded sales matched this area within the {rangeLabel}.
                  </div>
                )}
              </div>
            )}

            {!scope && (
              <div className="mt-6 grid gap-4 sm:grid-cols-2">
                <Link
                  href="/sold-prices"
                  className="rounded-[24px] border border-stone-200 bg-white px-5 py-5 transition hover:border-stone-300 hover:bg-stone-50"
                >
                  <p className="text-sm text-stone-500">Sold prices hub</p>
                  <p className="mt-2 text-xl font-semibold tracking-tight text-stone-900">
                    Back to sold prices
                  </p>
                  <p className="mt-2 text-sm leading-6 text-stone-600">
                    Browse counties, quick areas and tracked market reports.
                  </p>
                </Link>
                <Link
                  href="/sold-prices/counties-compared"
                  className="rounded-[24px] border border-stone-200 bg-white px-5 py-5 transition hover:border-stone-300 hover:bg-stone-50"
                >
                  <p className="text-sm text-stone-500">Compare counties</p>
                  <p className="mt-2 text-xl font-semibold tracking-tight text-stone-900">
                    Start with county pages
                  </p>
                  <p className="mt-2 text-sm leading-6 text-stone-600">
                    Pick a county market page first, then drill into local areas.
                  </p>
                </Link>
              </div>
            )}
            {scope && results?.error && (
              <p className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
                {results.error}
              </p>
            )}
          </section>

        </div>

        <div className="mt-8">
          <PprDisclaimer />
        </div>
      </section>
    </main>
  )
}
