import Link from "next/link"
import { supabase } from "@/lib/supabase"
import SellerEmailField from "@/components/SellerEmailField"
import CopyListingLinkButton from "@/components/CopyListingLinkButton"

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
  const listingsForSale = listings.filter(
    (listing) => listing.status === "For Sale"
  ).length

  return (
    <main className="min-h-screen bg-white">
      <section className="mx-auto max-w-6xl px-6 py-12">
        <div className="mb-10">
          <p className="text-sm font-medium uppercase tracking-[0.24em] text-slate-500">
            OpenList
          </p>

          <h1 className="mt-2 text-4xl font-semibold tracking-tight text-slate-900">
            Dashboard
          </h1>

          <p className="mt-3 max-w-2xl text-lg text-slate-600">
            Manage your listings and keep track of your property pages.
          </p>
        </div>

        <div className="rounded-[28px] border border-slate-200 bg-slate-50 p-6">
          <form className="grid gap-4 md:grid-cols-[minmax(0,1fr)_auto]">
            <div>
              <SellerEmailField
                id="email"
                name="email"
                label="Seller email"
                defaultValue={trimmedEmail}
              />
            </div>

            <div className="flex items-end gap-3">
              <button
                type="submit"
                className="inline-flex h-12 items-center rounded-full bg-slate-900 px-6 text-sm font-medium text-white transition hover:bg-slate-700"
              >
                View dashboard
              </button>

              <Link
                href="/sell"
                className="inline-flex h-12 items-center rounded-full border border-slate-300 bg-white px-6 text-sm font-medium text-slate-900 transition hover:bg-slate-100"
              >
                Create listing
              </Link>

              {trimmedEmail && (
                <Link
                  href={`/enquiries?email=${encodeURIComponent(trimmedEmail)}`}
                  className="inline-flex h-12 items-center rounded-full border border-slate-300 bg-white px-6 text-sm font-medium text-slate-900 transition hover:bg-slate-100"
                >
                  View enquiries
                </Link>
              )}
            </div>
          </form>
        </div>

        {!trimmedEmail ? (
          <div className="mt-8 rounded-[28px] border border-slate-200 bg-white p-8 text-center shadow-sm">
            <h2 className="text-2xl font-semibold text-slate-900">
              Enter your email to view your dashboard
            </h2>
            <p className="mt-3 text-slate-600">
              This is a simple MVP view for managing your listings and enquiries.
            </p>
          </div>
        ) : errorMessage ? (
          <div className="mt-8 rounded-2xl border border-red-200 bg-red-50 p-6 text-red-700">
            Database error: {errorMessage}
          </div>
        ) : (
          <>
            <div className="mt-8 grid gap-4 md:grid-cols-3">
              <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
                <p className="text-sm text-slate-500">Total listings</p>
                <p className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">
                  {totalListings}
                </p>
              </div>

              <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
                <p className="text-sm text-slate-500">Live for sale</p>
                <p className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">
                  {listingsForSale}
                </p>
              </div>

              <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
                <p className="text-sm text-slate-500">Total enquiries</p>
                <p className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">
                  {totalEnquiries}
                </p>
              </div>
            </div>

            {listings.length > 0 ? (
              <div className="mt-8 space-y-5">
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
                  const latestEnquiryAt =
                    enquirySummary?.latestEnquiryAt ?? null

                  return (
                    <div
                      key={listing.slug}
                      className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-sm"
                    >
                      <div className="grid md:grid-cols-[260px_minmax(0,1fr)]">
                        <div className="bg-slate-100">
                          <div className="aspect-[4/3] w-full">
                            {heroImage ? (
                              <img
                                src={heroImage}
                                alt={listing.title}
                                className="h-full w-full object-cover"
                              />
                            ) : (
                              <div className="flex h-full w-full items-center justify-center text-sm text-slate-400">
                                No image
                              </div>
                            )}
                          </div>
                        </div>

                        <div className="p-6">
                          <div className="flex flex-wrap items-start justify-between gap-4">
                            <div className="flex flex-wrap items-center gap-3">
                              <span className="inline-flex items-center rounded-full bg-slate-900 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-white">
                                {listing.status}
                              </span>

                              <span className="text-xs uppercase tracking-[0.22em] text-slate-500">
                                {listing.type}
                              </span>

                              <span className="text-sm text-slate-500">
                                {listing.county}
                              </span>
                            </div>

                            <p className="text-2xl font-semibold tracking-tight text-slate-900">
                              {formatEuro(listing.price)}
                            </p>
                          </div>

                          <h2 className="mt-4 text-2xl font-semibold tracking-tight text-slate-900">
                            {listing.title}
                          </h2>

                          <div className="mt-5 grid gap-4 sm:grid-cols-3">
                            <div className="rounded-2xl bg-slate-50 p-4">
                              <p className="text-xs uppercase tracking-wide text-slate-500">
                                Enquiries
                              </p>
                              <p className="mt-2 text-xl font-semibold text-slate-900">
                                {enquiryCount}
                              </p>
                            </div>

                            <div className="rounded-2xl bg-slate-50 p-4">
                              <p className="text-xs uppercase tracking-wide text-slate-500">
                                Latest enquiry
                              </p>
                              <p className="mt-2 text-sm font-medium text-slate-900">
                                {formatDate(latestEnquiryAt)}
                              </p>
                            </div>

                            <div className="rounded-2xl bg-slate-50 p-4">
                              <p className="text-xs uppercase tracking-wide text-slate-500">
                                Created
                              </p>
                              <p className="mt-2 text-sm font-medium text-slate-900">
                                {formatDate(listing.created_at)}
                              </p>
                            </div>
                          </div>

                          <div className="mt-6 flex flex-wrap gap-3">
                            <Link
                              href={`/listings/${listing.slug}`}
                              className="inline-flex items-center rounded-full border border-slate-300 px-4 py-2 text-sm font-medium text-slate-900 transition hover:bg-slate-100"
                            >
                              View listing
                            </Link>

                            <Link
                              href={`/listings/${listing.slug}/edit`}
                              className="inline-flex items-center rounded-full bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-700"
                            >
                              Edit listing
                            </Link>

                            <CopyListingLinkButton slug={listing.slug} />

                            <Link
                              href={`/enquiries?email=${encodeURIComponent(trimmedEmail)}`}
                              className="inline-flex items-center rounded-full border border-slate-300 px-4 py-2 text-sm font-medium text-slate-900 transition hover:bg-slate-100"
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
              <div className="mt-8 rounded-[28px] border border-slate-200 bg-white p-8 text-center shadow-sm">
                <h2 className="text-2xl font-semibold text-slate-900">
                  No listings found
                </h2>
                <p className="mt-3 text-slate-600">
                  We couldn’t find any listings for{" "}
                  <span className="font-medium">{trimmedEmail}</span>.
                </p>

                <div className="mt-6">
                  <Link
                    href="/sell"
                    className="inline-flex items-center rounded-full bg-slate-900 px-5 py-3 text-sm font-medium text-white transition hover:bg-slate-700"
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