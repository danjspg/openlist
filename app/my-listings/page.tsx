import type { Metadata } from "next"
import Image from "next/image"
import Link from "next/link"
import { redirect } from "next/navigation"
import { supabase } from "@/lib/supabase"
import CopyListingLinkButton from "@/components/CopyListingLinkButton"
import { isLiveSaleStatus, normalizeListingStatus } from "@/lib/listing-status"
import { requireSellerUser } from "@/lib/seller-auth"
import { getDisplayListingTitle } from "@/lib/listings"

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
  owner_user_id?: string | null
  title: string
  public_title?: string | null
  seller_name?: string | null
  seller_phone?: string | null
  county: string
  price: string
  status: string
  featured?: boolean
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
  searchParams: Promise<{ archived?: string }>
}) {
  const { archived } = await searchParams
  const currentUser = await requireSellerUser().catch(() => null)

  if (!currentUser) {
    redirect("/sign-in?redirectTo=%2Fmy-listings")
  }

  let listings: ListingRow[] = []
  let enquiries: EnquiryRow[] = []
  let errorMessage = ""

  const { data: listingData, error: listingsError } = await supabase
    .from("listings")
    .select("*")
    .eq("owner_user_id", currentUser.id)
    .order("created_at", { ascending: false })

  if (listingsError) {
    errorMessage = listingsError.message
  } else {
    listings = ((listingData ?? []) as ListingRow[])
      .map((listing) => normalizeListingStatus(listing))
      .filter((listing) => listing.status !== "Archived")

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
  const liveListings = listings.filter((listing) => isLiveSaleStatus(listing.status)).length

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
              Signed in as <span className="font-medium text-stone-900">{currentUser.email}</span>. Your owned listings appear here automatically.
            </p>
          </div>
        </div>

        {archived === "1" && (
          <div className="mb-6 rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-emerald-800">
            Listing deleted successfully.
          </div>
        )}

        <div className="mb-8 rounded-[28px] border border-stone-200 bg-white p-4 shadow-sm sm:mb-10 sm:p-5">
          <div className="flex flex-wrap gap-3">
            <Link
              href="/sell"
              className="inline-flex h-11 items-center justify-center rounded-full bg-stone-900 px-5 text-sm font-medium text-white transition hover:bg-stone-700"
            >
              Start your listing
            </Link>
          </div>
        </div>

        {errorMessage ? (
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
                  return (
                    <div
                      key={listing.slug}
                      className="overflow-hidden rounded-[30px] border border-stone-200 bg-white shadow-sm"
                    >
                      <div className="grid md:grid-cols-[280px_minmax(0,1fr)]">
                        <div className="bg-stone-100">
                          <div className="relative aspect-[4/3] w-full overflow-hidden">
                            {heroImage ? (
                              <Image
                                src={heroImage}
                                alt={getDisplayListingTitle(listing)}
                                fill
                                sizes="(max-width: 768px) 100vw, 280px"
                                unoptimized
                                className="h-full w-full object-cover"
                              />
                            ) : (
                              <div className="flex h-full w-full items-center justify-center text-sm text-stone-400">
                                No image
                              </div>
                            )}

                            <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/10 via-transparent to-transparent" />

                            <div className="absolute left-4 top-4">
                              <span className="inline-flex items-center rounded-full bg-white/92 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-stone-700 shadow-sm backdrop-blur">
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
                                {listing.featured && (
                                  <span className="inline-flex items-center rounded-full bg-stone-900 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-white">
                                    Featured
                                  </span>
                                )}
                                <span className="text-sm text-stone-500">
                                  {listing.county}
                                </span>
                              </div>

                              <h2 className="mt-3 text-2xl font-semibold leading-snug tracking-tight text-stone-900 sm:text-[2rem]">
                                {getDisplayListingTitle(listing)}
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

                            {currentUser.email && (
                              <Link
                                href={`/enquiries?email=${encodeURIComponent(currentUser.email)}`}
                                className="inline-flex items-center rounded-full border border-stone-300 bg-white px-4 py-2 text-sm font-medium text-stone-700 transition hover:border-stone-400 hover:text-stone-900"
                              >
                                View enquiries
                              </Link>
                            )}
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
                  We couldn&apos;t find any owned listings on this account yet.
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
