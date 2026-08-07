import type { Metadata } from "next"
import Image from "next/image"
import Link from "next/link"
import PprHomepageStatsBar from "@/components/ppr/PprHomepageStatsBar"
import { getHomepageSoldPriceStats } from "@/lib/ppr-analytics"
import { buildPprDatasetDescription, getPprDatasetSummary } from "@/lib/ppr"

export const metadata: Metadata = {
  title: "OpenList | Property Tools & Sold Prices Ireland",
  description:
    "Property tools for Ireland. Research sold prices, explore planning data and organise property viewings in one place.",
  alternates: {
    canonical: "/",
  },
}

export const revalidate = 21600

const coreTools = [
  {
    title: "Research Prices",
    text: "Explore sold-price data, market trends and local insights.",
    href: "/sold-prices",
  },
  {
    title: "Planning & Development",
    text: "Search planning applications and development activity.",
    href: "/planning",
  },
  {
    title: "Manage Viewings",
    text: "Create, organise and track property viewings.",
    href: "/viewings",
  },
]

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
              PROPERTY TOOLS FOR IRELAND
            </p>

            <h1 className="mt-4 max-w-3xl text-4xl font-semibold tracking-tight text-stone-900 sm:mt-5 sm:text-5xl md:text-[3.5rem] md:leading-[1.05]">
              Property tools for Ireland
            </h1>

            <p className="mt-5 max-w-[34rem] text-base leading-7 text-stone-600 sm:mt-6 sm:text-lg sm:leading-8">
              Sold prices, planning data and property viewing tools in one place.
            </p>

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
              <Link
                href="/viewings"
                className="rounded-full border border-stone-300 px-5 py-3 text-sm font-medium text-stone-700 transition hover:border-stone-900 hover:text-stone-900 sm:px-6"
              >
                Manage viewings
              </Link>
            </div>

            <div className="mt-7 grid gap-3 sm:grid-cols-3 lg:mt-8">
              {coreTools.map((item) => (
                <Link
                  key={item.title}
                  href={item.href}
                  className="group rounded-2xl border border-stone-200 bg-white/85 px-4 py-4 shadow-sm transition hover:-translate-y-0.5 hover:border-stone-300 hover:bg-white hover:shadow-md"
                >
                  <h2 className="text-base font-semibold tracking-tight text-stone-900 transition group-hover:text-stone-700">
                    {item.title}
                  </h2>
                  <p className="mt-1.5 text-sm leading-5 text-stone-600">
                    {item.text}
                  </p>
                </Link>
              ))}
            </div>
          </div>

          <div className="grid gap-3 sm:gap-4 sm:grid-cols-2">
            <Link
              href="/sold-prices"
              className="group relative block h-[220px] overflow-hidden rounded-3xl bg-white shadow-sm sm:col-span-2 sm:h-[280px] lg:h-[360px]"
            >
              <Image
                src="/home-hero-1.jpg"
                alt="OpenList sold-price research"
                fill
                sizes="(max-width: 640px) 100vw, (max-width: 1024px) 100vw, 50vw"
                className="object-cover transition duration-500 group-hover:scale-[1.02]"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/35 via-black/10 to-transparent transition duration-300 group-hover:from-black/45" />
              <div className="absolute bottom-6 left-6">
                <div className="inline-flex items-center rounded-full bg-white/92 px-4 py-2 text-sm font-semibold text-stone-900 shadow-sm backdrop-blur transition group-hover:bg-white">
                  Explore sold prices
                  <span className="ml-2 transition duration-200 group-hover:translate-x-0.5">
                    &rarr;
                  </span>
                </div>
              </div>
            </Link>

            <Link
              href="/planning"
              className="group relative hidden h-36 overflow-hidden rounded-3xl bg-white shadow-sm sm:block sm:h-48 lg:h-52"
            >
              <Image
                src="/home-hero-2.jpg"
                alt="OpenList planning research"
                fill
                sizes="(max-width: 640px) 100vw, 50vw"
                className="object-cover transition duration-500 group-hover:scale-[1.02]"
              />
              <div className="absolute bottom-4 left-4 rounded-full bg-white/92 px-3 py-1.5 text-sm font-semibold text-stone-900 shadow-sm">
                Planning
              </div>
            </Link>

            <Link
              href="/viewings"
              className="group relative hidden h-36 overflow-hidden rounded-3xl bg-white shadow-sm sm:block sm:h-48 lg:h-52"
            >
              <Image
                src="/home-hero-3.jpg"
                alt="OpenList viewing management"
                fill
                sizes="(max-width: 640px) 100vw, 50vw"
                className="object-cover transition duration-500 group-hover:scale-[1.02]"
              />
              <div className="absolute bottom-4 left-4 rounded-full bg-white/92 px-3 py-1.5 text-sm font-semibold text-stone-900 shadow-sm">
                Viewings
              </div>
            </Link>
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

      <section className="mx-auto max-w-6xl px-4 py-14 sm:px-6 sm:py-16">
        <div className="max-w-2xl">
          <p className="text-sm uppercase tracking-[0.2em] text-stone-500">
            What you can do
          </p>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight md:text-4xl">
            What you can do with OpenList
          </h2>
        </div>

        <div className="mt-8 grid gap-6 sm:mt-10 md:grid-cols-3">
          {[
            {
              step: "01",
              title: "Research Prices",
              text: "Browse sold-price data, market trends and local insights.",
              href: "/sold-prices",
            },
            {
              step: "02",
              title: "Planning & Development",
              text: "Search planning applications and development activity.",
              href: "/planning",
            },
            {
              step: "03",
              title: "Manage Viewings",
              text: "Create, edit, clone and track property viewings.",
              href: "/viewings",
            },
          ].map((item) => (
            <Link
              key={item.step}
              href={item.href}
              className="group rounded-3xl border border-stone-200 bg-white p-7 shadow-sm transition hover:-translate-y-1 hover:border-stone-300 hover:shadow-md sm:p-8"
            >
              <p className="text-sm font-medium tracking-[0.2em] text-stone-400">
                {item.step}
              </p>
              <h3 className="mt-4 text-2xl font-semibold tracking-tight transition group-hover:text-stone-700">
                {item.title}
              </h3>
              <p className="mt-4 text-base leading-7 text-stone-600">
                {item.text}
              </p>
            </Link>
          ))}
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
          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              href="/sold-prices"
              className="inline-block rounded-full bg-stone-900 px-6 py-3 text-sm font-medium text-white transition hover:bg-stone-700"
            >
              View sold prices
            </Link>
            <Link
              href="/planning"
              className="inline-block rounded-full border border-stone-300 px-6 py-3 text-sm font-medium text-stone-700 transition hover:border-stone-900 hover:text-stone-900"
            >
              Search planning data
            </Link>
          </div>
        </div>
      </section>
    </main>
  )
}
