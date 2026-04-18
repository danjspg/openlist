import Link from "next/link"
import { supabase } from "@/lib/supabase"

type Listing = {
  slug: string
  title: string
  county: string
  price: string
  image: string
  images?: string[] | null
  status: string
  created_at?: string
}

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
  const { data: featuredData, error: featuredError } = await supabase
    .from("listings")
    .select("slug,title,county,price,image,images,status,created_at")
    .eq("status", "Featured")
    .order("created_at", { ascending: false })
    .limit(3)

  const { data: latestData, error: latestError } = await supabase
    .from("listings")
    .select("slug,title,county,price,image,images,status,created_at")
    .order("created_at", { ascending: false })
    .limit(3)

  const featuredListings: Listing[] =
    !featuredError && featuredData && featuredData.length > 0
      ? featuredData
      : !latestError && latestData
        ? latestData
        : []

  return (
    <main className="min-h-screen bg-stone-50 text-stone-900">
      <section className="mx-auto grid max-w-6xl gap-10 px-4 py-12 sm:px-6 sm:py-16 lg:grid-cols-[1.05fr_0.95fr] lg:items-center lg:gap-12 lg:py-24">
        <div>
          <p className="text-sm uppercase tracking-[0.25em] text-stone-500">
            Modern private property sales
          </p>

          <h1 className="mt-4 max-w-3xl text-4xl font-semibold tracking-tight text-stone-900 sm:mt-5 sm:text-5xl md:text-6xl">
            Sell beautifully.
            <br />
            Keep more of the value.
          </h1>

          <p className="mt-5 max-w-2xl text-base leading-7 text-stone-600 sm:mt-6 sm:text-lg sm:leading-8">
            OpenList is a more elegant way to market exceptional homes and sites
            in Ireland — combining premium presentation, modern tools, and a
            simpler fixed-fee approach.
          </p>

          <div className="mt-7 flex flex-wrap gap-3 sm:mt-8 sm:gap-4">
            <Link
              href="/sell"
              className="rounded-full bg-stone-900 px-5 py-3 text-sm font-medium text-white transition hover:bg-stone-700 sm:px-6"
            >
              Start selling
            </Link>
            <Link
              href="/listings"
              className="rounded-full border border-stone-300 px-5 py-3 text-sm font-medium text-stone-700 transition hover:border-stone-900 hover:text-stone-900 sm:px-6"
            >
              Browse listings
            </Link>
          </div>

          <div className="mt-8 grid grid-cols-1 gap-5 text-sm text-stone-500 sm:mt-10 sm:grid-cols-3 sm:gap-8">
            <div>
              <div className="text-2xl font-semibold text-stone-900">Fixed fee</div>
              <div className="mt-1">No traditional commission drag</div>
            </div>
            <div>
              <div className="text-2xl font-semibold text-stone-900">Premium</div>
              <div className="mt-1">Calm, design-led presentation</div>
            </div>
            <div>
              <div className="text-2xl font-semibold text-stone-900">Direct</div>
              <div className="mt-1">A more transparent seller journey</div>
            </div>
          </div>

          <div className="mt-8 rounded-2xl border border-stone-200 bg-white/80 px-5 py-4 shadow-sm sm:mt-10">
            <p className="text-sm leading-6 text-stone-600">
              OpenList is a marketing platform for private property listings.
            </p>
            <p className="mt-2 text-sm leading-6 text-stone-600">
              Listing information is provided by sellers and has not been independently verified.
              OpenList does not act as an estate agent and does not provide valuation,
              negotiation, or legal services.
            </p>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="overflow-hidden rounded-3xl bg-white shadow-sm sm:col-span-2">
            <img
              src="https://images.unsplash.com/photo-1505693416388-ac5ce068fe85?auto=format&fit=crop&w=1600&q=80"
              alt="Luxury home exterior"
              className="h-[300px] w-full object-cover sm:h-[360px] lg:h-[420px]"
            />
          </div>

          <div className="overflow-hidden rounded-3xl bg-white shadow-sm">
            <img
              src="https://images.unsplash.com/photo-1494526585095-c41746248156?auto=format&fit=crop&w=1000&q=80"
              alt="Modern interior"
              className="h-48 w-full object-cover sm:h-56"
            />
          </div>

          <div className="overflow-hidden rounded-3xl bg-white shadow-sm">
            <img
              src="https://images.unsplash.com/photo-1512917774080-9991f1c4c750?auto=format&fit=crop&w=1000&q=80"
              alt="Elegant home"
              className="h-48 w-full object-cover sm:h-56"
            />
          </div>
        </div>
      </section>

      <section className="border-y border-stone-200 bg-stone-100/70">
        <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6 sm:py-16">
          <div className="max-w-2xl">
            <p className="text-sm uppercase tracking-[0.2em] text-stone-500">
              Featured listings
            </p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight md:text-4xl">
              Homes and sites presented with more care.
            </h2>
          </div>

          <div className="mt-8 grid gap-6 sm:mt-10 md:grid-cols-3 md:gap-8">
            {featuredListings.length > 0 ? (
              featuredListings.map((listing) => {
                const displayImage =
                  listing.images && listing.images.length > 0
                    ? listing.images[0]
                    : listing.image

                return (
                  <article
                    key={listing.slug}
                    className="group overflow-hidden rounded-[30px] border border-stone-200 bg-white shadow-sm transition duration-300 hover:-translate-y-1 hover:shadow-md"
                  >
                    <div className="relative overflow-hidden">
                      <img
                        src={displayImage}
                        alt={listing.title}
                        className="h-56 w-full object-cover transition duration-500 group-hover:scale-[1.02] sm:h-64"
                      />
                      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/10 via-transparent to-transparent" />

                      <div className="absolute right-4 top-4">
                        <span className="inline-flex items-center rounded-full bg-white/92 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-stone-700 shadow-sm backdrop-blur">
                          {listing.status}
                        </span>
                      </div>
                    </div>

                    <div className="p-5 sm:p-6">
                      <div className="flex items-start justify-between gap-4">
                        <span className="text-xs font-medium uppercase tracking-[0.18em] text-stone-500 sm:text-sm">
                          {listing.county}
                        </span>
                        <span className="shrink-0 text-sm font-semibold text-stone-900 sm:text-base">
                          {formatEuro(listing.price)}
                        </span>
                      </div>

                      <h3 className="mt-4 text-2xl font-semibold leading-tight tracking-tight text-stone-900 sm:text-[2rem]">
                        {listing.title}
                      </h3>

                      <Link
                        href={`/listings/${listing.slug}`}
                        className="mt-6 inline-flex items-center text-sm font-medium text-stone-700 transition group-hover:text-stone-900"
                      >
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
                      </Link>
                    </div>
                  </article>
                )
              })
            ) : (
              <div className="rounded-3xl border border-stone-200 bg-white p-8 text-stone-600 md:col-span-3">
                No featured listings yet.
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
        <div className="max-w-2xl">
          <p className="text-sm uppercase tracking-[0.2em] text-stone-500">
            How it works
          </p>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight md:text-4xl">
            A simpler, more modern way to sell.
          </h2>
        </div>

        <div className="mt-8 grid gap-6 sm:mt-10 md:grid-cols-3">
          {[
            {
              step: "01",
              title: "Create your listing",
              text: "Start with your property details, images, and a cleaner presentation designed to feel more premium from day one.",
            },
            {
              step: "02",
              title: "Launch with confidence",
              text: "Go live with a strong, design-led listing experience that feels closer to a boutique brand than a crowded portal.",
            },
            {
              step: "03",
              title: "Manage interest directly",
              text: "Handle enquiries, viewings, and buyer conversations in a more transparent and cost-efficient way.",
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

      <section className="mx-auto max-w-6xl px-4 pb-4 sm:px-6">
        <div className="rounded-[2rem] bg-stone-900 px-6 py-10 text-white sm:px-8 sm:py-12 md:px-12 md:py-16">
          <div className="max-w-2xl">
            <p className="text-sm uppercase tracking-[0.2em] text-stone-400">
              For sellers
            </p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight md:text-4xl">
              Better presentation. Lower friction. More control.
            </h2>
            <p className="mt-5 text-base leading-7 text-stone-300 sm:text-lg sm:leading-8">
              OpenList is built for homeowners who want a more thoughtful,
              modern way to sell — without defaulting to the old high-friction
              model.
            </p>

            <div className="mt-8">
              <Link
                href="/sell"
                className="inline-block rounded-full bg-white px-6 py-3 text-sm font-medium text-stone-900 transition hover:bg-stone-200"
              >
                Explore selling with OpenList
              </Link>
            </div>

            <div className="mt-8 border-t border-white/10 pt-6">
              <p className="text-sm leading-6 text-stone-300">
                OpenList is a marketing platform for private property listings.
                Sellers remain responsible for the accuracy of listing information,
                and interested parties should satisfy themselves as to accuracy.
              </p>
            </div>
          </div>
        </div>
      </section>
    </main>
  )
}