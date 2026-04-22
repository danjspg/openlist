import { unstable_cache } from "next/cache"
import Image from "next/image"
import Link from "next/link"
import PprHomepageStatsBar from "@/components/ppr/PprHomepageStatsBar"
import { getHomepageSoldPriceStats } from "@/lib/ppr-analytics"
import { buildPprDatasetDescription, getPprDatasetSummary } from "@/lib/ppr"
import { getServerSupabase } from "@/lib/supabase"
import { isPublicSaleStatus, normalizeListingStatus, PUBLIC_SALE_STATUSES } from "@/lib/listing-status"
import { getDisplayListingTitle } from "@/lib/listings"

type Listing = {
  slug: string
  title: string
  public_title?: string | null
  county: string
  price: string
  image: string
  images?: string[] | null
  status: string
  featured?: boolean
  created_at?: string
}

export const revalidate = 21600
const HOMEPAGE_RECENT_LISTINGS_CACHE_VERSION = "v2"

const getHomepageRecentListings = unstable_cache(
  async (): Promise<Listing[]> => {
    const supabase = getServerSupabase()
    const { data, error } = await supabase
      .from("listings")
      .select("slug,title,public_title,county,price,image,images,status,created_at")
      .in("status", [...PUBLIC_SALE_STATUSES, "Featured"])
      .order("created_at", { ascending: false })
      .limit(6)

    if (error || !data) {
      return []
    }

    return (data as Listing[])
      .map((listing) => normalizeListingStatus(listing))
      .filter((listing) => isPublicSaleStatus(listing.status))
      .slice(0, 3)
  },
  ["homepage-recent-listings", HOMEPAGE_RECENT_LISTINGS_CACHE_VERSION],
  { revalidate: 21600 }
)

function formatEuro(value: string) {
  const numeric = Number(value.replace(/[^0-9.]/g, ""))

  if (Number.isNaN(numeric)) {
    return value
  }

  return new Intl.NumberFormat("en-IE", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(numeric)
}

export default async function HomePage() {
  const [recentListings, soldPriceStats, datasetSummary] = await Promise.all([
    getHomepageRecentListings(),
    getHomepageSoldPriceStats(),
    getPprDatasetSummary(),
  ])
  const datasetDescription = buildPprDatasetDescription(datasetSummary)

  return (
    <main className="min-h-screen bg-stone-50 text-stone-900">
      <section className="mx-auto grid max-w-6xl gap-10 px-4 py-12 sm:px-6 sm:py-16 lg:grid-cols-[1.05fr_0.95fr] lg:items-center lg:gap-12 lg:py-24">
        <div className="max-w-[580px]">
          <p className="text-sm uppercase tracking-[0.25em] text-stone-500">
            PRIVATE PROPERTY SALES IN IRELAND
          </p>

          <h1 className="mt-4 max-w-3xl text-4xl font-semibold tracking-tight text-stone-900 sm:mt-5 sm:text-5xl md:text-6xl">
            A simpler way to sell your home privately in Ireland
          </h1>

          <p className="mt-5 max-w-[34rem] text-base leading-7 text-stone-600 sm:mt-6 sm:text-lg sm:leading-8">
            Create a clear, straightforward property listing for the Irish market.
          </p>

          <p className="mt-3 max-w-[34rem] text-sm leading-6 text-stone-500 sm:text-base">
            Designed for people who want to create and manage their own property listing.
          </p>

          <div className="mt-8 sm:mt-9">
            <div className="flex flex-wrap gap-3 sm:gap-4">
              <Link
                href="/sell"
                className="rounded-full bg-stone-900 px-5 py-3 text-sm font-medium text-white transition hover:bg-stone-700 sm:px-6"
              >
                Start your listing
              </Link>
              <Link
                href="/sold-prices"
                className="rounded-full border border-stone-300 px-5 py-3 text-sm font-medium text-stone-700 transition hover:border-stone-900 hover:text-stone-900 sm:px-6"
              >
                View sold prices
              </Link>
            </div>
            <p className="mt-4 max-w-[34rem] text-sm leading-6 text-stone-500">
              OpenList provides tools to create and manage your listing.
              <br />
              You remain the seller at all times.
            </p>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-4 text-sm text-stone-500 sm:mt-5 sm:grid-cols-2 sm:gap-6">
            <div className="min-w-0">
              <div className="text-xl font-semibold text-stone-900">Stay in control</div>
              <div className="mt-0.5 leading-6">Manage your own listing and receive enquiries directly from buyers.</div>
            </div>
            <div className="min-w-0">
              <div className="text-xl font-semibold text-stone-900">Clear listings</div>
              <div className="mt-0.5 leading-6">Present your property in a simple, well-structured format.</div>
            </div>
          </div>
        </div>

        <div className="grid gap-3 sm:gap-4 sm:grid-cols-2">
          <Link
            href="/listings"
            className="group relative block h-[220px] overflow-hidden rounded-3xl bg-white shadow-sm sm:col-span-2 sm:h-[280px] lg:h-[360px]"
          >
            <Image
              src="/home-hero-1.jpg"
              alt="Browse OpenList property listings"
              fill
              sizes="(max-width: 640px) 100vw, (max-width: 1024px) 100vw, 50vw"
              className="object-cover transition duration-500 group-hover:scale-[1.02]"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/35 via-black/10 to-transparent transition duration-300 group-hover:from-black/45" />
            <div className="absolute bottom-6 left-6">
              <div className="inline-flex items-center rounded-full bg-white/92 px-4 py-2 text-sm font-semibold text-stone-900 shadow-sm backdrop-blur transition group-hover:bg-white">
                View listings
                <span className="ml-2 transition duration-200 group-hover:translate-x-0.5">
                  →
                </span>
              </div>
            </div>
          </Link>

          <Link
            href="/listings"
            className="group relative hidden h-36 overflow-hidden rounded-3xl bg-white shadow-sm sm:block sm:h-48 lg:h-52"
          >
            <Image
              src="/home-hero-2.jpg"
              alt="Modern interior on OpenList"
              fill
              sizes="(max-width: 640px) 100vw, 50vw"
              className="object-cover transition duration-500 group-hover:scale-[1.02]"
            />
          </Link>

          <Link
            href="/listings"
            className="group relative hidden h-36 overflow-hidden rounded-3xl bg-white shadow-sm sm:block sm:h-48 lg:h-52"
          >
            <Image
              src="/home-hero-3.jpg"
              alt="Elegant home on OpenList"
              fill
              sizes="(max-width: 640px) 100vw, 50vw"
              className="object-cover transition duration-500 group-hover:scale-[1.02]"
            />
          </Link>
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
          <PprHomepageStatsBar stats={soldPriceStats} />
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-14 sm:px-6 sm:py-16">
        <div className="max-w-2xl">
          <p className="text-sm uppercase tracking-[0.2em] text-stone-500">
            How it works
          </p>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight md:text-4xl">
            A simpler way to sell your home privately in Ireland.
          </h2>
        </div>

        <div className="mt-8 grid gap-6 sm:mt-10 md:grid-cols-3">
          {[
            {
              step: "01",
              title: "Create your listing",
              text: "Add your property details, photos and key information in a clear, straightforward format.",
            },
            {
              step: "02",
              title: "Go live",
              text: "Put your listing online with a clean layout that gives buyers the information they need.",
            },
            {
              step: "03",
              title: "Deal directly",
              text: "Handle enquiries and viewings yourself, with buyers contacting you directly through the listing.",
            },
          ].map((item) => (
            <div
              key={item.step}
              className="rounded-3xl border border-stone-200 bg-white p-7 shadow-sm sm:p-8"
            >
              <p className="text-sm font-medium tracking-[0.2em] text-stone-400">
                {item.step}
              </p>
              <h3 className="mt-4 text-2xl font-semibold tracking-tight">
                {item.title}
              </h3>
              <p className="mt-4 text-base leading-7 text-stone-600">
                {item.text}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section className="border-y border-stone-200 bg-stone-100/70">
        <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6 sm:py-16">
          <div className="max-w-2xl">
            <p className="text-sm uppercase tracking-[0.2em] text-stone-500">
              Latest listings
            </p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight md:text-4xl">
              Homes and sites across Ireland, presented with more care.
            </h2>
          </div>

          <div className="mt-8 grid grid-cols-1 gap-6 sm:mt-10 sm:grid-cols-2 md:grid-cols-3 md:gap-8">
            {recentListings.length > 0 ? (
              recentListings.map((listing) => {
                const displayImage =
                  listing.images && listing.images.length > 0
                    ? listing.images[0]
                    : listing.image

                return (
                  <Link
                    key={listing.slug}
                    href={`/listings/${listing.slug}`}
                    className="group block cursor-pointer overflow-hidden rounded-[30px] border border-stone-200 bg-white shadow-sm transition duration-300 hover:-translate-y-1 hover:shadow-md"
                  >
                    <article>
                      <div className="relative h-52 overflow-hidden sm:h-60">
                        <Image
                          src={displayImage}
                          alt={getDisplayListingTitle(listing)}
                          fill
                          sizes="(max-width: 768px) 100vw, 33vw"
                          unoptimized
                          className="object-cover transition duration-500 group-hover:scale-[1.02]"
                        />
                        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/10 via-transparent to-transparent" />

                        <div className="absolute right-4 top-4">
                          <span className="inline-flex items-center rounded-full bg-white/92 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-stone-700 shadow-sm backdrop-blur">
                            {listing.status}
                          </span>
                        </div>
                      </div>

                      <div className="p-5 sm:p-6">
                        <div className="flex items-center justify-between gap-4">
                          <span className="text-[11px] font-semibold uppercase tracking-[0.22em] text-stone-500 sm:text-xs">
                            {listing.county}
                          </span>

                          <span className="shrink-0 text-base font-semibold text-stone-900 sm:text-lg">
                            {formatEuro(listing.price)}
                          </span>
                        </div>

                        <h3 className="mt-3 text-xl font-semibold leading-snug tracking-tight text-stone-900 sm:text-2xl">
                          {getDisplayListingTitle(listing)}
                        </h3>

                        <div className="mt-5 inline-flex items-center text-sm font-medium text-stone-600 transition group-hover:text-stone-900">
                          View listing
                          <svg
                            className="ml-2 h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            aria-hidden="true"
                          >
                            <path d="M5 12h14" />
                            <path d="m12 5 7 7-7 7" />
                          </svg>
                        </div>
                      </div>
                    </article>
                  </Link>
                )
              })
            ) : (
              <div className="rounded-3xl border border-stone-200 bg-white p-8 text-stone-600 md:col-span-3">
                Listings will appear here soon.
              </div>
            )}
          </div>

          <div className="mt-8 sm:mt-10">
            <Link
              href="/listings"
              className="inline-block rounded-full border border-stone-300 px-5 py-3 text-sm font-medium text-stone-700 transition hover:border-stone-900 hover:text-stone-900"
            >
              View all listings
            </Link>
          </div>
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
            Property price information is provided for general information only and as market context only. It does not constitute a valuation, pricing advice, investment advice, legal advice, or a recommendation about how any property should be marketed or sold.
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-2 text-sm text-stone-600">
            <span className="font-medium text-stone-700">Popular areas:</span>
            <Link
              href="/sold-prices/dublin"
              className="rounded-full border border-stone-300 px-3 py-1.5 transition hover:border-stone-900 hover:text-stone-900"
            >
              Dublin
            </Link>
            <Link
              href="/sold-prices/cork"
              className="rounded-full border border-stone-300 px-3 py-1.5 transition hover:border-stone-900 hover:text-stone-900"
            >
              Cork
            </Link>
            <Link
              href="/sold-prices/galway"
              className="rounded-full border border-stone-300 px-3 py-1.5 transition hover:border-stone-900 hover:text-stone-900"
            >
              Galway
            </Link>
            <Link
              href="/sold-prices/limerick"
              className="rounded-full border border-stone-300 px-3 py-1.5 transition hover:border-stone-900 hover:text-stone-900"
            >
              Limerick
            </Link>
            <Link
              href="/sold-prices/waterford"
              className="rounded-full border border-stone-300 px-3 py-1.5 transition hover:border-stone-900 hover:text-stone-900"
            >
              Waterford
            </Link>
            <Link
              href="/sold-prices/drogheda"
              className="rounded-full border border-stone-300 px-3 py-1.5 transition hover:border-stone-900 hover:text-stone-900"
            >
              Drogheda
            </Link>
            <Link
              href="/sold-prices/swords"
              className="rounded-full border border-stone-300 px-3 py-1.5 transition hover:border-stone-900 hover:text-stone-900"
            >
              Swords
            </Link>
            <Link
              href="/sold-prices/bray"
              className="rounded-full border border-stone-300 px-3 py-1.5 transition hover:border-stone-900 hover:text-stone-900"
            >
              Bray
            </Link>
            <Link
              href="/sold-prices/dundalk"
              className="rounded-full border border-stone-300 px-3 py-1.5 transition hover:border-stone-900 hover:text-stone-900"
            >
              Dundalk
            </Link>
            <Link
              href="/sold-prices/navan"
              className="rounded-full border border-stone-300 px-3 py-1.5 transition hover:border-stone-900 hover:text-stone-900"
            >
              Navan
            </Link>
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

      <section className="mx-auto max-w-6xl px-4 pb-4 sm:px-6">
        <div className="rounded-[2rem] bg-stone-900 px-6 py-10 text-white sm:px-8 sm:py-12 md:px-12 md:py-16">
          <div className="max-w-2xl">
            <p className="text-sm uppercase tracking-[0.2em] text-stone-400">
              THINKING OF SELLING?
            </p>
            <p className="mt-5 whitespace-pre-line text-base leading-7 text-stone-300 sm:text-lg sm:leading-8">
              Create a clear, well-presented private sale listing and receive enquiries directly from buyers.
            </p>

            <div className="mt-8">
              <Link
                href="/sell"
                className="inline-block rounded-full bg-white px-6 py-3 text-sm font-medium text-stone-900 transition hover:bg-stone-200"
              >
                Start your listing
              </Link>
            </div>

            <div className="mt-8 border-t border-white/10 pt-6">
              <p className="whitespace-pre-line text-sm leading-6 text-stone-300">
                You manage your listing and deal directly with buyers.
              </p>
            </div>

            <div className="mt-8 border-t border-white/10 pt-6">
              <p className="text-sm leading-6 text-stone-300">
                Listing information is provided by sellers and has not been independently verified.
                OpenList is a self-service listing and marketing platform. It does not
                act as an estate agent and does not provide valuation services, pricing
                advice, negotiation services, legal services, brokerage services, or
                transaction management.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-12">
        <div className="max-w-[40rem] rounded-2xl border border-stone-200/60 bg-stone-100/40 px-4 py-3 shadow-[0_1px_2px_rgba(28,25,23,0.03)]">
          <p className="text-[13px] leading-5 text-stone-600">
            OpenList is a self-service platform for private property listings in Ireland.
          </p>
          <p className="mt-1.5 text-[13px] leading-5 text-stone-600">
            Listing information is provided by sellers and has not been independently verified.
            OpenList is a self-service listing and marketing platform. It does not act as an estate agent and does not provide valuation services, pricing advice, negotiation services, legal services, brokerage services, or transaction management.
          </p>
        </div>
      </section>
    </main>
  )
}
