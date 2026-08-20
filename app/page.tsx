import type { Metadata } from "next"
import Image from "next/image"
import Link from "next/link"
import PprHomepageStatsBar from "@/components/ppr/PprHomepageStatsBar"
import { getHomepageSoldPriceStats } from "@/lib/ppr-analytics"
import {
  buildPprDatasetDescription,
  formatPprDate,
  getPprDatasetSummary,
} from "@/lib/ppr"
import { formatPlanningDate } from "@/lib/planning"
import { getHomepagePlanningSummary } from "@/lib/homepage-data"

export const metadata: Metadata = {
  title: "Planning Applications & Sold Prices Ireland | OpenList",
  description:
    "Search Irish sold prices and planning applications. Check recorded property sales, local market trends and development activity across Ireland.",
  alternates: {
    canonical: "/",
  },
}

export const revalidate = 21600

// Keep homepage photography swappable by role instead of coupling copy or links to files.
const homepageImages = {
  establishedHousing: {
    src: "/home-modern-irish-street.jpg",
    alt: "A street of established Irish homes",
    position: "object-center",
  },
  plannedDevelopment: {
    src: "/home-planning-aerial-v2.jpg",
    alt: "An Irish neighbourhood beside active housing construction",
    position: "object-center",
  },
} as const

export default async function HomePage() {
  const [soldPriceStats, datasetSummary, planningSummary] = await Promise.all([
    getHomepageSoldPriceStats(),
    getPprDatasetSummary(),
    getHomepagePlanningSummary().catch(() => ({
      totalCount: 0,
      latestRegistrationDate: null,
    })),
  ])
  const homepageSoldPriceStats = soldPriceStats.filter(
    (stat) => stat.eyebrow !== "Most affordable market"
  )
  const datasetDescription = buildPprDatasetDescription(datasetSummary)
  const numberFormat = new Intl.NumberFormat("en-IE")

  return (
    <main className="min-h-screen bg-stone-50 text-stone-900">
      <section className="mx-auto max-w-6xl px-4 py-12 sm:px-6 sm:py-16 lg:py-24">
        <div className="grid gap-10 lg:grid-cols-[1.12fr_0.88fr] lg:items-center lg:gap-12">
          <div className="max-w-[680px]">
            <p className="text-sm uppercase tracking-[0.25em] text-stone-500">
              PROPERTY RESEARCH FOR IRELAND
            </p>

            <h1 className="mt-4 max-w-3xl text-4xl font-semibold tracking-tight text-stone-900 sm:mt-5 sm:text-5xl md:text-[3.5rem] md:leading-[1.05]">
              Planning &amp; Sold Prices Across Ireland
            </h1>

            <p className="mt-5 max-w-[36rem] text-base leading-7 text-stone-600 sm:mt-6 sm:text-lg sm:leading-8">
              Search recorded property sales and planning applications across Ireland. Check what a home sold for, what is proposed nearby and how an area is changing.
            </p>

            <form action="/search" className="mt-7 flex max-w-xl gap-2 rounded-2xl border border-stone-300 bg-white p-2 shadow-sm">
              <input
                type="search"
                name="q"
                aria-label="Search property intelligence"
                placeholder="Search an address, area, Eircode or planning reference"
                className="min-h-12 min-w-0 flex-1 rounded-xl px-3 text-sm outline-none placeholder:text-stone-400 focus:bg-stone-50 sm:text-base"
              />
              <button type="submit" className="min-h-12 shrink-0 rounded-xl bg-stone-950 px-4 text-sm font-semibold text-white transition hover:bg-stone-700 sm:px-5">Search</button>
            </form>

            <div className="mt-8 flex flex-wrap gap-3 sm:mt-9 sm:gap-4">
              <Link
                href="/planning"
                className="rounded-full bg-stone-900 px-5 py-3 text-sm font-medium text-white transition hover:bg-stone-700 sm:px-6"
              >
                Search planning
              </Link>
              <Link
                href="/sold-prices"
                className="rounded-full border border-stone-300 px-5 py-3 text-sm font-medium text-stone-700 transition hover:border-stone-900 hover:text-stone-900 sm:px-6"
              >
                Search sold prices
              </Link>
            </div>

            <div className="mt-7 grid gap-3 sm:grid-cols-2 lg:mt-8">
              <Link
                href="/planning"
                className="group rounded-2xl border border-stone-200 bg-white/85 px-4 py-4 shadow-sm transition hover:-translate-y-0.5 hover:border-stone-300 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stone-300"
              >
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-500">
                  Planning applications
                </p>
                <h2 className="mt-2 text-base font-semibold tracking-tight text-stone-900">
                  See what is proposed around a property
                </h2>
                <p className="mt-1.5 text-sm leading-5 text-stone-600">
                  Search by address, area or reference, then follow proposals, status, key dates and decisions.
                </p>
                {planningSummary.totalCount > 0 ? (
                  <p className="mt-3 text-xs leading-5 text-stone-500">
                    {numberFormat.format(planningSummary.totalCount)} planning applications
                    {planningSummary.latestRegistrationDate
                      ? ` · latest registered ${formatPlanningDate(planningSummary.latestRegistrationDate)}`
                      : ""}
                  </p>
                ) : null}
                <p className="text-xs leading-5 text-stone-400">
                  Source: Irish local authorities
                </p>
                <p className="mt-3 text-sm font-semibold text-stone-800">
                  Search planning <span aria-hidden="true" className="transition group-hover:translate-x-0.5">→</span>
                </p>
              </Link>

              <Link
                href="/sold-prices"
                className="group rounded-2xl border border-stone-200 bg-white/85 px-4 py-4 shadow-sm transition hover:-translate-y-0.5 hover:border-stone-300 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stone-300"
              >
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-500">
                  Sold prices
                </p>
                <h2 className="mt-2 text-base font-semibold tracking-tight text-stone-900">
                  See what homes actually sold for
                </h2>
                <p className="mt-1.5 text-sm leading-5 text-stone-600">
                  Search Property Price Register transactions, compare areas and explore local market trends.
                </p>
                <p className="mt-3 text-xs leading-5 text-stone-500">
                  {numberFormat.format(datasetSummary.salesCount)} recorded sales
                  {datasetSummary.latestSaleDate
                    ? ` · latest recorded sale ${formatPprDate(datasetSummary.latestSaleDate)}`
                    : ""}
                </p>
                <p className="text-xs leading-5 text-stone-400">
                  Source: Property Price Register
                </p>
                <p className="mt-3 text-sm font-semibold text-stone-800">
                  Search sold prices <span aria-hidden="true" className="transition group-hover:translate-x-0.5">→</span>
                </p>
              </Link>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 sm:gap-4" aria-label="Irish housing and development photography">
            <div className="relative h-[220px] overflow-hidden rounded-3xl bg-white shadow-sm sm:col-span-2 sm:h-[280px] lg:h-[360px]">
              <Image
                src={homepageImages.establishedHousing.src}
                alt={homepageImages.establishedHousing.alt}
                fill
                priority
                sizes="(max-width: 640px) 100vw, (max-width: 1024px) 100vw, 50vw"
                className={`object-cover ${homepageImages.establishedHousing.position}`}
              />
            </div>

            <div className="relative hidden h-36 overflow-hidden rounded-3xl bg-white shadow-sm sm:col-span-2 sm:block sm:h-48 lg:h-52">
              <Image
                src={homepageImages.plannedDevelopment.src}
                alt={homepageImages.plannedDevelopment.alt}
                fill
                sizes="(max-width: 1024px) 100vw, 50vw"
                className={`object-cover ${homepageImages.plannedDevelopment.position}`}
              />
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 pb-10 sm:px-6 sm:pb-12">
        <div className="max-w-2xl">
          <p className="text-sm uppercase tracking-[0.2em] text-stone-500">
            Ireland market snapshot
          </p>
          <p className="mt-3 text-base leading-7 text-stone-600 sm:text-lg sm:leading-8">
            A quick view of sale prices, activity and standout markets from recorded Property Price Register transactions.
          </p>
        </div>
        <div className="mt-8 sm:mt-10">
          <PprHomepageStatsBar stats={homepageSoldPriceStats} />
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-14 sm:px-6 sm:py-16">
        <div className="rounded-[32px] border border-stone-200 bg-white p-7 shadow-sm sm:p-8 md:p-10">
          <div className="grid gap-8 lg:grid-cols-[1.15fr_0.85fr] lg:gap-12">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-stone-500">
                Explore sold prices
              </p>
              <h2 className="mt-2 text-3xl font-semibold tracking-tight text-stone-900 md:text-4xl">
                Start with a place you know
              </h2>
              <p className="mt-4 max-w-2xl whitespace-pre-line text-base leading-7 text-stone-600 sm:text-lg sm:leading-8">
                {datasetDescription}
              </p>
              <div className="mt-5 flex flex-wrap items-center gap-2 text-sm text-stone-600">
                <span className="font-medium text-stone-700">Popular areas:</span>
                {[
                  ["/sold-prices/dublin", "Dublin"],
                  ["/sold-prices/cork", "Cork"],
                  ["/sold-prices/galway", "Galway"],
                  ["/sold-prices/limerick", "Limerick"],
                  ["/sold-prices/waterford", "Waterford"],
                  ["/sold-prices/louth/drogheda", "Drogheda"],
                  ["/sold-prices/dublin/swords", "Swords"],
                  ["/sold-prices/wicklow/bray", "Bray"],
                  ["/sold-prices/louth/dundalk", "Dundalk"],
                  ["/sold-prices/meath/navan", "Navan"],
                ].map(([href, label]) => (
                  <Link
                    key={href}
                    href={href}
                    className="rounded-full border border-stone-300 px-3 py-1.5 transition hover:border-stone-900 hover:text-stone-900"
                  >
                    {label}
                  </Link>
                ))}
              </div>
              <div className="mt-6">
                <Link
                  href="/sold-prices"
                  className="inline-block rounded-full bg-stone-900 px-6 py-3 text-sm font-medium text-white transition hover:bg-stone-700"
                >
                  Explore sold prices
                </Link>
              </div>
            </div>

            <div className="border-t border-stone-200 pt-7 lg:border-l lg:border-t-0 lg:pl-10 lg:pt-0">
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-stone-500">
                Explore planning
              </p>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight text-stone-900">
                Find an application or understand nearby development
              </h2>
              <p className="mt-4 text-sm leading-6 text-stone-600">
                Search current and historic planning applications by address, area, council or reference. OpenList brings proposals, status, key dates and available lifecycle history together, with a link back to the official council record.
              </p>
              <p className="mt-4 text-sm leading-6 text-stone-600">
                Useful for checking a specific application, researching a property or seeing what may change around an area.
              </p>
              <div className="mt-6">
                <Link
                  href="/planning"
                  className="inline-block rounded-full border border-stone-300 px-6 py-3 text-sm font-medium text-stone-800 transition hover:border-stone-900"
                >
                  Search planning applications
                </Link>
              </div>
            </div>
          </div>

          <p className="mt-8 border-t border-stone-200 pt-6 text-xs leading-5 text-stone-500">
            OpenList uses public Property Price Register and Irish local-authority planning data. Always check the official source before relying on a record for a property decision.
          </p>
        </div>
      </section>
    </main>
  )
}
