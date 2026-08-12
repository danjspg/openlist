import type { Metadata } from "next"
import Image from "next/image"
import Link from "next/link"
import PprHomepageStatsBar from "@/components/ppr/PprHomepageStatsBar"
import { getHomepageSoldPriceStats } from "@/lib/ppr-analytics"
import { buildPprDatasetDescription, getPprDatasetSummary } from "@/lib/ppr"

export const metadata: Metadata = {
  title: "OpenList | Property Intelligence for Ireland",
  description:
    "Search Irish sold prices and planning applications. Research properties, neighbourhoods and development activity with OpenList.",
  alternates: {
    canonical: "/",
  },
}

export const revalidate = 21600

const primaryProducts = [
  {
    title: "See what properties really sold for",
    text: "Search Property Price Register records, compare locations and explore market trends.",
  },
  {
    title: "See what’s being built around you",
    text: "Search planning applications, development activity and planning decisions.",
  },
]

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
  const [soldPriceStats, datasetSummary] = await Promise.all([
    getHomepageSoldPriceStats(),
    getPprDatasetSummary(),
  ])
  const homepageSoldPriceStats = soldPriceStats.filter(
    (stat) => stat.eyebrow !== "Most affordable market"
  )
  const datasetDescription = buildPprDatasetDescription(datasetSummary)

  return (
    <main className="min-h-screen bg-stone-50 text-stone-900">
      <section className="mx-auto max-w-6xl px-4 py-12 sm:px-6 sm:py-16 lg:py-24">
        <div className="grid gap-10 lg:grid-cols-[1.12fr_0.88fr] lg:items-center lg:gap-12">
          <div className="max-w-[680px]">
            <p className="text-sm uppercase tracking-[0.25em] text-stone-500">
              PROPERTY INTELLIGENCE FOR IRELAND
            </p>

            <h1 className="mt-4 max-w-3xl text-4xl font-semibold tracking-tight text-stone-900 sm:mt-5 sm:text-5xl md:text-[3.5rem] md:leading-[1.05]">
              Understand property in Ireland
            </h1>

            <p className="mt-5 max-w-[34rem] text-base leading-7 text-stone-600 sm:mt-6 sm:text-lg sm:leading-8">
              Search Irish sold prices and planning applications. Research properties,
              neighbourhoods and development activity in one place.
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
                href="/sold-prices"
                className="rounded-full bg-stone-900 px-5 py-3 text-sm font-medium text-white transition hover:bg-stone-700 sm:px-6"
              >
                View sold prices
              </Link>
              <Link
                href="/planning"
                className="rounded-full border border-stone-300 px-5 py-3 text-sm font-medium text-stone-700 transition hover:border-stone-900 hover:text-stone-900 sm:px-6"
              >
                Search planning
              </Link>
            </div>

            <div className="mt-7 grid gap-3 sm:grid-cols-2 lg:mt-8">
              {primaryProducts.map((item) => (
                <article
                  key={item.title}
                  className="rounded-2xl border border-stone-200 bg-white/85 px-4 py-4 shadow-sm"
                >
                  <h2 className="text-base font-semibold tracking-tight text-stone-900">
                    {item.title}
                  </h2>
                  <p className="mt-1.5 text-sm leading-5 text-stone-600">
                    {item.text}
                  </p>
                </article>
              ))}
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
            Ireland Market Snapshot
          </p>
          <p className="mt-3 text-base leading-7 text-stone-600 sm:text-lg sm:leading-8">
            See what homes are selling for across Ireland.
          </p>
        </div>
        <div className="mt-8 sm:mt-10">
          <PprHomepageStatsBar stats={homepageSoldPriceStats} />
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
        <div className="flex flex-col gap-5 rounded-3xl border border-stone-200 bg-stone-100 p-6 sm:flex-row sm:items-center sm:justify-between sm:p-8">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-stone-500">Viewing organiser</p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight text-stone-900">Keep your property viewings organised.</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-stone-600">Viewings is a personal signed-in utility for keeping dates, notes and property details together.</p>
          </div>
          <Link href="/viewings" className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-full border border-stone-300 bg-white px-5 text-sm font-semibold text-stone-800 transition hover:border-stone-900">
            Manage viewings
          </Link>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-14 sm:px-6 sm:py-16">
        <div className="rounded-[32px] border border-stone-200 bg-white p-7 shadow-sm sm:p-8 md:p-10">
          <h2 className="text-3xl font-semibold tracking-tight text-stone-900 md:text-4xl">
            See what homes sold for
          </h2>
          <p className="mt-4 max-w-2xl whitespace-pre-line text-base leading-7 text-stone-600 sm:text-lg sm:leading-8">
            {datasetDescription}
          </p>
          <p className="mt-4 max-w-3xl text-sm leading-6 text-stone-600">
            Property price information is provided for general information only and as market context only. It does not constitute a valuation, pricing advice, investment advice, legal advice, or a recommendation about any property decision.
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-2 text-sm text-stone-600">
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
              View sold prices
            </Link>
          </div>
        </div>
      </section>
    </main>
  )
}
