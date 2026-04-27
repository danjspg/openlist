import Link from "next/link"

export default function SoldPricesNotFound() {
  return (
    <main className="min-h-screen bg-stone-50">
      <section className="mx-auto flex min-h-[70vh] max-w-4xl items-center px-4 py-12 sm:px-6">
        <div className="w-full rounded-[28px] border border-stone-200 bg-white p-8 shadow-sm sm:p-10">
          <p className="text-sm font-medium uppercase tracking-[0.24em] text-stone-500">
            Sold prices
          </p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-stone-900 sm:text-4xl">
            We could not find that sold-prices page.
          </h1>
          <p className="mt-4 max-w-2xl text-sm leading-6 text-stone-600 sm:text-base sm:leading-7">
            Use the sold-prices hub to browse county pages, tracked market reports and reliable
            local area pages.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              href="/sold-prices"
              className="inline-flex rounded-full bg-stone-900 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-stone-700"
            >
              Open sold prices
            </Link>
            <Link
              href="/sold-prices/counties-compared"
              className="inline-flex rounded-full border border-stone-300 px-5 py-2.5 text-sm font-medium text-stone-700 transition hover:border-stone-900 hover:text-stone-900"
            >
              Compare counties
            </Link>
          </div>
        </div>
      </section>
    </main>
  )
}
