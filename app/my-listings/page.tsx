import type { Metadata } from "next"
import Link from "next/link"
import { supabase } from "@/lib/supabase"
import SellerEmailField from "@/components/SellerEmailField"
import CopyListingLinkButton from "@/components/CopyListingLinkButton"

export const metadata: Metadata = {
  title: "My Listings | OpenList",
  robots: {
    index: false,
    follow: false,
  },
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

function formatDate(value?: string | null) {
  if (!value) return "—"

  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return "—"
  }

  return new Intl.DateTimeFormat("en-IE", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date)
}

type ListingRow = {
  slug: string
  title: string
  county: string
  price: string
  status: string
  type: string
  image: string
  images?: string[] | null
  created_at?: string
}

type EnquiryRow = {
  listing_slug: string
  created_at: string
}

export default async function MyListingsPage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string }>
}) {
  const { email = "" } = await searchParams
  const trimmedEmail = email.trim()

  let listings: ListingRow[] = []
  let enquiries: EnquiryRow[] = []
  let errorMessage = ""

  if (trimmedEmail) {
    const { data: listingData, error: listingsError } = await supabase
      .from("listings")
      .select("slug,title,county,price,status,type,image,images,created_at")
      .eq("seller_email", trimmedEmail)
      .order("created_at", { ascending: false })

    if (listingsError) {
      errorMessage = listingsError.message
    } else {
      listings = listingData ?? []

      const slugs = listings.map((listing) => listing.slug)

      if (slugs.length > 0) {
        const { data: enquiryData, error: enquiriesError } = await supabase
          .from("enquiries")
          .select("listing_slug,created_at")
          .in("listing_slug", slugs)
          .order("created_at", { ascending: false })

        if (enquiriesError) {
          errorMessage = enquiriesError.message
        } else {
          enquiries = enquiryData ?? []
        }
      }
    }
  }

  const enquiryMap = new Map<
    string,
    { count: number; latestEnquiryAt: string | null }
  >()

  for (const enquiry of enquiries) {
    const existing = enquiryMap.get(enquiry.listing_slug)

    if (!existing) {
      enquiryMap.set(enquiry.listing_slug, {
        count: 1,
        latestEnquiryAt: enquiry.created_at,
      })
    } else {
      enquiryMap.set(enquiry.listing_slug, {
        count: existing.count + 1,
        latestEnquiryAt: existing.latestEnquiryAt ?? enquiry.created_at,
      })
    }
  }

  const totalListings = listings.length
  const totalEnquiries = enquiries.length
  const liveListings = listings.filter((listing) =>
    ["For Sale", "Featured"].includes(listing.status)
  ).length

  return (
    <main className="min-h-screen bg-stone-50">
      <section className="mx-auto max-w-7xl px-4 py-10 sm:px-6 sm:py-12">
        <div className="mb-8 overflow-hidden rounded-[32px] border border-stone-200 bg-white shadow-sm">
          <div className="bg-gradient-to-br from-stone-50 via-white to-stone-100 px-5 py-7 sm:px-6 md:px-8 md:py-10">
            <p className="text-sm font-medium uppercase tracking-[0.24em] text-stone-500">
              OpenList
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-stone-900 sm:text-4xl md:text-5xl">
              My Listings
            </h1>
            <p className="mt-4 max-w-2xl text-base leading-7 text-stone-600 sm:text-lg sm:leading-8">
              Manage your listings, review enquiry activity, and edit your listings.
            </p>
          </div>

          <div className="border-t border-stone-200 px-5 py-4 sm:px-6 md:px-8 md:py-5">
            <p className="max-w-3xl text-sm leading-6 text-stone-500">
              Enter the same seller email used when your listing was created. This gives
              you a simple dashboard view of your property pages and recent enquiry activity.
            </p>
          </div>
        </div>

        <div className="mb-8 rounded-[28px] border border-stone-200 bg-white p-4 shadow-sm sm:mb-10 sm:p-5">
          <form className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto_auto] lg:items-end">
            <div>
              <SellerEmailField
                id="email"
                name="email"
                label="Seller email"
                defaultValue={trimmedEmail}
              />
            </div>

            <button
              type="submit"
              className="h-11 rounded-full bg-stone-900 px-5 text-sm font-medium text-white transition hover:bg-stone-700"
            >
              View my listings
            </button>

            <Link
              href="/sell"
              className="inline-flex h-11 items-center justify-center rounded-full border border-stone-300 bg-white px-5 text-sm font-medium text-stone-700 transition hover:border-stone-400 hover:text-stone-900"
            >
              Start your listing
            </Link>
          </form>

          {trimmedEmail && (
            <div className="mt-4 flex flex-wrap gap-3">
              <Link
                href={`/enquiries?email=${encodeURIComponent(trimmedEmail)}`}
                className="inline-flex items-center rounded-full border border-stone-300 bg-white px-4 py-2 text-sm font-medium text-stone-700 transition hover:border-stone-400 hover:text-stone-900"
              >
                View enquiries
              </Link>
            </div>
          )}
        </div>

        {!trimmedEmail ? (
          <div className="rounded-[28px] border border-stone-200 bg-white p-10 text-center shadow-sm">
            <h2 className="text-2xl font-semibold tracking-tight text-stone-900">
              Enter your seller email to view your listings
            </h2>
            <p className="mt-3 text-stone-600">
              Use the email linked to your OpenList listings to see them in one place.
            </p>
          </div>
        ) : errorMessage ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-red-700">
            Database error: {errorMessage}
          </div>
        ) : (
          <>
            <div className="mb-8 grid gap-4 md:grid-cols-3">
              <div className="rounded-[28px] border border-stone-200 bg-white p-6 shadow-sm">
                <p className="text-sm text-stone-500">Total listings</p>
                <p className="mt-2 text-3xl font-semibold tracking-tight text-stone-900">
                  {totalListings}
                </p>
              </div>

              <div className="rounded-[28px] border border-stone-200 bg-white p-6 shadow-sm">
                <p className="text-sm text-stone-500">Live listings</p>
                <p className="mt-2 text-3xl font-semibold tracking-tight text-stone-900">
                  {liveListings}
                </p>
              </div>

              <div className="rounded-[28px] border border-stone-200 bg-white p-6 shadow-sm">
                <p className="text-sm text-stone-500">Total enquiries</p>
                <p className="mt-2 text-3xl font-semibold tracking-tight text-stone-900">
                  {totalEnquiries}
                </p>
              </div>
            </div>

            {listings.length > 0 ? (
              <div className="space-y-5">
                {listings.map((listing) => {
                  const images =
                    listing.images && listing.images.length > 0
                      ? listing.images
                      : listing.image
                        ? [listing.image]
                        : []

                  const heroImage = images[0]
                  const enquirySummary = enquiryMap.get(listing.slug)
                  const enquiryCount = enquirySummary?.count ?? 0
                  const latestEnquiryAt = enquirySummary?.latestEnquiryAt ?? null
                  const isFeatured = listing.status === "Featured"

                  return (
                    <div
                      key={listing.slug}
                      className="overflow-hidden rounded-[30px] border border-stone-200 bg-white shadow-sm"
                    >
                      <div className="grid md:grid-cols-[280px_minmax(0,1fr)]">
                        <div className="bg-stone-100">
                          <div className="relative aspect-[4/3] w-full overflow-hidden">
                            {heroImage ? (
                              <img
                                src={heroImage}
                                alt={listing.title}
                                className="h-full w-full object-cover"
                              />
                            ) : (
                              <div className="flex h-full w-full items-center justify-center text-sm text-stone-400">
                                No image
                              </div>
                            )}

                            <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/10 via-transparent to-transparent" />

                            <div className="absolute left-4 top-4">
                              <span
                                className={`inline-flex items-center rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] shadow-sm backdrop-blur ${
                                  isFeatured
                                    ? "bg-stone-900 text-white"
                                    : "bg-white/92 text-stone-700"
                                }`}
                              >
                                {listing.status}
                              </span>
                            </div>
                          </div>
                        </div>

                        <div className="p-5 sm:p-6">
                          <div className="flex flex-wrap items-start justify-between gap-4">
                            <div>
                              <div className="flex flex-wrap items-center gap-3">
                                <span className="text-[11px] font-semibold uppercase tracking-[0.22em] text-stone-500 sm:text-xs">
                                  {listing.type}
                                </span>
                                <span className="text-sm text-stone-500">
                                  {listing.county}
                                </span>
                              </div>

                              <h2 className="mt-3 text-2xl font-semibold leading-snug tracking-tight text-stone-900 sm:text-[2rem]">
                                {listing.title}
                              </h2>
                            </div>

                            <p className="shrink-0 text-2xl font-semibold tracking-tight text-stone-900">
                              {formatEuro(listing.price)}
                            </p>
                          </div>

                          <div className="mt-5 grid gap-4 sm:grid-cols-3">
                            <div className="rounded-2xl border border-stone-200 bg-stone-50 p-4">
                              <p className="text-xs uppercase tracking-[0.18em] text-stone-500">
                                Enquiries
                              </p>
                              <p className="mt-2 text-xl font-semibold text-stone-900">
                                {enquiryCount}
                              </p>
                            </div>

                            <div className="rounded-2xl border border-stone-200 bg-stone-50 p-4">
                              <p className="text-xs uppercase tracking-[0.18em] text-stone-500">
                                Latest enquiry
                              </p>
                              <p className="mt-2 text-sm font-medium text-stone-900">
                                {formatDate(latestEnquiryAt)}
                              </p>
                            </div>

                            <div className="rounded-2xl border border-stone-200 bg-stone-50 p-4">
                              <p className="text-xs uppercase tracking-[0.18em] text-stone-500">
                                Created
                              </p>
                              <p className="mt-2 text-sm font-medium text-stone-900">
                                {formatDate(listing.created_at)}
                              </p>
                            </div>
                          </div>

                          <div className="mt-6 flex flex-wrap gap-3">
                            <Link
                              href={`/listings/${listing.slug}`}
                              className="inline-flex items-center rounded-full border border-stone-300 bg-white px-4 py-2 text-sm font-medium text-stone-700 transition hover:border-stone-400 hover:text-stone-900"
                            >
                              View listing
                            </Link>

                            <Link
                              href={`/listings/${listing.slug}/edit`}
                              className="inline-flex items-center rounded-full bg-stone-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-stone-700"
                            >
                              Edit listing
                            </Link>

                            <CopyListingLinkButton slug={listing.slug} />

                            <Link
                              href={`/enquiries?email=${encodeURIComponent(trimmedEmail)}`}
                              className="inline-flex items-center rounded-full border border-stone-300 bg-white px-4 py-2 text-sm font-medium text-stone-700 transition hover:border-stone-400 hover:text-stone-900"
                            >
                              View enquiries
                            </Link>
                          </div>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            ) : (
              <div className="rounded-[28px] border border-stone-200 bg-white p-10 text-center shadow-sm">
                <h2 className="text-2xl font-semibold tracking-tight text-stone-900">
                  No listings found
                </h2>
                <p className="mt-3 text-stone-600">
                  We couldn’t find any listings for{" "}
                  <span className="font-medium text-stone-900">{trimmedEmail}</span>.
                </p>

                <div className="mt-6">
                  <Link
                    href="/sell"
                    className="inline-flex items-center rounded-full bg-stone-900 px-5 py-3 text-sm font-medium text-white transition hover:bg-stone-700"
                  >
                    Create your first listing
                  </Link>
                </div>
              </div>
            )}
          </>
        )}
      </section>
    </main>
  )
}
