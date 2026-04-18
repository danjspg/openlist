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
      <section className="mx-auto grid max-w-6xl gap-12 px-6 py-16 lg:grid-cols-[1.05fr_0.95fr] lg:items-center lg:py-24">
        <div>
          <p className="text-sm uppercase tracking-[0.25em] text-stone-500">
            Modern private property sales
          </p>

          <h1 className="mt-5 max-w-3xl text-5xl font-semibold tracking-tight text-stone-900 md:text-6xl">
            Sell beautifully.
            <br />
            Keep more of the value.
          </h1>

          <p className="mt-6 max-w-2xl text-lg leading-8 text-stone-600">
            OpenList is a more elegant way to market exceptional homes and sites
            in Ireland — combining premium presentation, modern tools, and a
            simpler fixed-fee approach.
          </p>

          <div className="mt-8 flex flex-wrap gap-4">
            <Link
              href="/sell"
              className="rounded-full bg-stone-900 px-6 py-3 text-sm font-medium text-white transition hover:bg-stone-700"
            >
              Start selling
            </Link>
            <Link
              href="/listings"
              className="rounded-full border border-stone-300 px-6 py-3 text-sm font-medium text-stone-700 transition hover:border-stone-900 hover:text-stone-900"
            >
              Browse listings
            </Link>
          </div>

          <div className="mt-10 flex flex-wrap gap-8 text-sm text-stone-500">
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

          <div className="mt-10 rounded-2xl border border-stone-200 bg-white/80 px-5 py-4 shadow-sm">
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
              className="h-[420px] w-full object-cover"
            />
          </div>

          <div className="overflow-hidden rounded-3xl bg-white shadow-sm">
            <img
              src="https://images.unsplash.com/photo-1494526585095-c41746248156?auto=format&fit=crop&w=1000&q=80"
              alt="Modern interior"
              className="h-56 w-full object-cover"
            />
          </div>

          <div className="overflow-hidden rounded-3xl bg-white shadow-sm">
            <img
              src="https://images.unsplash.com/photo-1512917774080-9991f1c4c750?auto=format&fit=crop&w=1000&q=80"
              alt="Elegant home"
              className="h-56 w-full object-cover"
            />
          </div>
        </div>
      </section>

      <section className="border-y border-stone-200 bg-stone-100/70">
        <div className="mx-auto max-w-6xl px-6 py-16">
          <div className="max-w-2xl">
            <p className="text-sm uppercase tracking-[0.2em] text-stone-500">
              Featured listings
            </p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight md:text-4xl">
              Homes and sites presented with more care.
            </h2>
          </div>

          <div className="mt-10 grid gap-8 md:grid-cols-3">
            {featuredListings.length > 0 ? (
              featuredListings.map((listing) => {
                const displayImage =
                  listing.images && listing.images.length > 0
                    ? listing.images[0]
                    : listing.image

                return (
                  <article
                    key={listing.slug}
                    className="overflow-hidden rounded-3xl border border-stone-200 bg-white shadow-sm"
                  >
                    <img
                      src={displayImage}
                      alt={listing.title}
                      className="h-64 w-full object-cover"
                    />
                    <div className="p-6">
                      <div className="flex items-center justify-between gap-4">
                        <span className="text-sm uppercase tracking-wide text-stone-500">
                          {listing.county}
                        </span>
                        <span className="text-sm font-medium text-stone-900">
                          {listing.price}
                        </span>
                      </div>

                      <h3 className="mt-3 text-2xl font-semibold tracking-tight">
                        {listing.title}
                      </h3>

                      <Link
                        href={`/listings/${listing.slug}`}
                        className="mt-5 inline-block text-sm font-medium text-stone-700 underline-offset-4 transition hover:text-stone-900 hover:underline"
                      >
                        View listing
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

          <div className="mt-10">
            <Link
              href="/listings"
              className="inline-block rounded-full border border-stone-300 px-5 py-3 text-sm font-medium text-stone-700 transition hover:border-stone-900 hover:text-stone-900"
            >
              View all listings
            </Link>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 py-16">
        <div className="max-w-2xl">
          <p className="text-sm uppercase tracking-[0.2em] text-stone-500">
            How it works
          </p>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight md:text-4xl">
            A simpler, more modern way to sell.
          </h2>
        </div>

        <div className="mt-10 grid gap-6 md:grid-cols-3">
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
              className="rounded-3xl border border-stone-200 bg-white p-8 shadow-sm"
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

      <section className="mx-auto max-w-6xl px-6 pb-4">
        <div className="rounded-[2rem] bg-stone-900 px-8 py-12 text-white md:px-12 md:py-16">
          <div className="max-w-2xl">
            <p className="text-sm uppercase tracking-[0.2em] text-stone-400">
              For sellers
            </p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight md:text-4xl">
              Better presentation. Lower friction. More control.
            </h2>
            <p className="mt-5 text-lg leading-8 text-stone-300">
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