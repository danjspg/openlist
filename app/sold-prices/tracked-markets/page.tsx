import type { Metadata } from "next"
import Link from "next/link"

type TrackedMarketsSection = {
  title: string
  description: string
  items: Array<{ href: string; label: string }>
}

const TRACKED_MARKET_SECTIONS: TrackedMarketsSection[] = [
  {
    title: "County and city comparisons",
    description: "Start with county-level views or compare the main city market pages.",
    items: [
      { href: "/sold-prices/counties-compared", label: "Counties Compared" },
      { href: "/sold-prices/dublin-compared", label: "Dublin Market" },
      { href: "/sold-prices/cork-compared", label: "Cork Market" },
      { href: "/sold-prices/limerick-compared", label: "Limerick Market" },
      { href: "/sold-prices/galway-compared", label: "Galway Market" },
      { href: "/sold-prices/waterford-compared", label: "Waterford Market" },
    ],
  },
  {
    title: "Commuter and regional view",
    description: "Browse the main commuter-town comparison alongside the city and county pages.",
    items: [{ href: "/sold-prices/commuter-towns", label: "Dublin Commuter Towns" }],
  },
  {
    title: "Price-level reports",
    description: "Browse curated reports grouped by lower-priced and higher-priced tracked markets.",
    items: [
      { href: "/sold-prices/affordable-markets", label: "Affordable Markets" },
      { href: "/sold-prices/high-value-markets", label: "Premium Markets" },
    ],
  },
  {
    title: "Activity reports",
    description: "Compare markets by absolute recent turnover or by changes in recent sales activity.",
    items: [
      { href: "/sold-prices/most-active-markets", label: "Most Active Markets" },
      { href: "/sold-prices/least-active-markets", label: "Least Active Markets" },
      { href: "/sold-prices/hottest-markets", label: "Hottest Markets" },
      { href: "/sold-prices/coolest-markets", label: "Coolest Markets" },
    ],
  },
  {
    title: "Price-momentum reports",
    description: "See which tracked markets have been moving up or down most clearly in recent price trends.",
    items: [
      { href: "/sold-prices/rising-markets", label: "Rising Markets" },
      { href: "/sold-prices/falling-markets", label: "Falling Markets" },
    ],
  },
]

export const revalidate = 21600

export const metadata: Metadata = {
  title: "Tracked Property Market Reports Ireland | OpenList",
  description:
    "Browse tracked property market reports for Ireland, from county comparisons to activity and price trend pages.",
}

export default function TrackedMarketsPage() {
  return (
    <main className="min-h-screen bg-stone-50">
      <section className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-12">
        <div className="overflow-hidden rounded-[32px] border border-stone-200 bg-white shadow-sm">
          <div className="bg-gradient-to-br from-stone-50 via-white to-stone-100 px-5 py-8 sm:px-8 md:px-10 md:py-12">
            <p className="text-sm font-medium uppercase tracking-[0.24em] text-stone-500">
              TRACKED MARKETS
            </p>
            <h1 className="mt-3 max-w-4xl text-4xl font-semibold tracking-tight text-stone-900 sm:text-5xl">
              Tracked property market reports
            </h1>
            <p className="mt-5 max-w-3xl text-base leading-7 text-stone-600 sm:text-lg sm:leading-8">
              Browse the main sold-prices market reports, from county house-price comparisons to
              activity and price-trend pages.
            </p>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-stone-600">
              Use this directory to move between county comparisons, tracked city markets and the
              main property-price reports without relying on filtered search.
            </p>
          </div>
        </div>

        <div className="mt-8 space-y-6">
          {TRACKED_MARKET_SECTIONS.map((section) => (
            <section
              key={section.title}
              className="rounded-[28px] border border-stone-200 bg-white p-5 shadow-sm sm:p-6"
            >
              <div className="max-w-3xl">
                <p className="text-sm font-medium uppercase tracking-[0.2em] text-stone-500">
                  {section.title}
                </p>
                <p className="mt-2 text-sm leading-6 text-stone-600">{section.description}</p>
              </div>

              <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {section.items.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className="flex min-h-14 items-center rounded-[24px] border border-stone-200 bg-stone-50 px-5 py-4 text-sm font-medium text-stone-700 transition hover:border-stone-300 hover:bg-white hover:text-stone-900"
                  >
                    {item.label}
                  </Link>
                ))}
              </div>
            </section>
          ))}
        </div>
      </section>
    </main>
  )
}
