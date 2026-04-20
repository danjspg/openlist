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

  const featuredListings: Listing[] =
    !featuredError && featuredData ? featuredData : []

  return (
    <main className="min-h-screen bg-stone-50 text-stone-900">
      <section className="mx-auto grid max-w-6xl gap-10 px-4 py-12 sm:px-6 sm:py-16 lg:grid-cols-[1.05fr_0.95fr] lg:items-center lg:gap-12 lg:py-24">
        <div>
          <p className="text-sm uppercase tracking-[0.25em] text-stone-500">
            Private property sales in Ireland
          </p>

          <h1 className="mt-4 max-w-3xl text-4xl font-semibold tracking-tight text-stone-900 sm:mt-5 sm:text-5xl md:text-6xl">
            Sell beautifully.
            <br />
            Keep more of the value.
          </h1>

          <p className="mt-5 max-w-2xl text-base leading-7 text-stone-600 sm:mt-6 sm:text-lg sm:leading-8">
            OpenList is a modern platform for property listings in Ireland, helping
            private sellers present property properly and connect directly with buyers
            in a clearer, more considered way.
          </p>

          <div className="mt-7 flex flex-wrap gap-3 sm:mt-8 sm:gap-4">
            <Link
              href="/sell"
              className="rounded-full bg-stone-900 px-5 py-3 text-sm font-medium text-white transition hover:bg-stone-700 sm:px-6"
            >
              Create a listing
            </Link>
            <Link
              href="/listings"
              className="rounded-full border border-stone-300 px-5 py-3 text-sm font-medium text-stone-700 transition hover:border-stone-900 hover:text-stone-900 sm:px-6"
            >
              View listings
            </Link>
          </div>

          <div className="mt-8 grid grid-cols-1 gap-5 text-sm text-stone-500 sm:mt-10 sm:grid-cols-3 sm:gap-8">
            <div>
              <div className="text-2xl font-semibold text-stone-900">Fixed fee</div>
              <div className="mt-1">No traditional commission drag</div>
            </div>
            <div>
              <div className="text-2xl font-semibold text-stone-900">Clear</div>
              <div className="mt-1">Straightforward, well-presented listings</div>
            </div>
            <div>
              <div className="text-2xl font-semibold text-stone-900">Direct</div>
              <div className="mt-1">Buyers connect directly with sellers</div>
            </div>
          </div>

          <p className="mt-6 text-sm leading-6 text-stone-500">
            Built for how private property is actually marketed and sold in Ireland.
          </p>

          <div className="mt-8 rounded-2xl border border-stone-200 bg-white/80 px-5 py-4 shadow-sm sm:mt-10">
            <p className="text-sm leading-6 text-stone-600">
              OpenList is a marketing platform for private property listings in Ireland.
            </p>
            <p className="mt-2 text-sm leading-6 text-stone-600">
              Listing information is provided by sellers and has not been independently verified.
              OpenList does not act as an estate agent and does not provide valuation,
              negotiation, or legal services.
            </p>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Link
            href="/listings"
            className="group relative block overflow-hidden rounded-3xl bg-white shadow-sm sm:col-span-2"
          >
            <img
              src="/home-hero-1.jpg"
              alt="Browse OpenList property listings"
              className="h-[300px] w-full object-cover transition duration-500 group-hover:scale-[1.02] sm:h-[360px] lg:h-[420px]"
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
            className="group block overflow-hidden rounded-3xl bg-white shadow-sm"
          >
            <img
              src="/home-hero-2.jpg"
              alt="Modern interior on OpenList"
              className="h-48 w-full object-cover transition duration-500 group-hover:scale-[1.02] sm:h-56"
            />
          </Link>

          <Link
            href="/listings"
            className="group block overflow-hidden rounded-3xl bg-white shadow-sm"
          >
            <img
              src="/home-hero-3.jpg"
              alt="Elegant home on OpenList"
              className="h-48 w-full object-cover transition duration-500 group-hover:scale-[1.02] sm:h-56"
            />
          </Link>
        </div>
      </section>

      <section className="border-y border-stone-200 bg-stone-100/70">
        <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6 sm:py-16">
          <div className="max-w-2xl">
            <p className="text-sm uppercase tracking-[0.2em] text-stone-500">
              Featured listings
            </p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight md:text-4xl">
              Homes and sites across Ireland, presented with more care.
            </h2>
          </div>

          <div className="mt-8 grid grid-cols-1 gap-6 sm:mt-10 sm:grid-cols-2 md:grid-cols-3 md:gap-8">
            {featuredListings.length > 0 ? (
              featuredListings.map((listing) => {
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
                      <div className="relative overflow-hidden">
                        <img
                          src={displayImage}
                          alt={listing.title}
                          className="h-52 w-full object-cover transition duration-500 group-hover:scale-[1.02] sm:h-60"
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
                          {listing.title}
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
                Featured listings will appear here soon.
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
            A simpler way to sell property in Ireland.
          </h2>
        </div>

        <div className="mt-8 grid gap-6 sm:mt-10 md:grid-cols-3">
          {[
            {
              step: "01",
              title: "Create your listing",
              text: "Add your property details, photos and key information in a clear format that feels professional from the outset.",
            },
            {
              step: "02",
              title: "Publish with confidence",
              text: "Launch a clean, well-structured listing that presents the property properly and gives buyers the detail they need.",
            },
            {
              step: "03",
              title: "Deal directly",
              text: "Manage enquiries, viewings and buyer conversations directly, without unnecessary layers or old-fashioned friction.",
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
              Better presentation. Less friction. More control.
            </h2>
            <p className="mt-5 text-base leading-7 text-stone-300 sm:text-lg sm:leading-8">
              OpenList is built for homeowners in Ireland who want a more thoughtful,
              more direct way to sell — without defaulting to the usual high-friction model.
            </p>

            <div className="mt-8">
              <Link
                href="/sell"
                className="inline-block rounded-full bg-white px-6 py-3 text-sm font-medium text-stone-900 transition hover:bg-stone-200"
              >
                Create a listing
              </Link>
            </div>

            <div className="mt-8 border-t border-white/10 pt-6">
              <p className="text-sm leading-6 text-stone-300">
                OpenList is a marketing platform for private property listings in Ireland.
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
