import type { Metadata } from "next"
import Link from "next/link"
import { supabase } from "@/lib/supabase"
import SellerEmailField from "@/components/SellerEmailField"
import { normalizeListingStatus } from "@/lib/listing-status"
import { getDisplayListingTitle } from "@/lib/listings"

export const metadata: Metadata = {
  title: "Enquiries | OpenList",
  robots: {
    index: false,
    follow: false,
  },
}

type ListingRow = {
  slug: string
  title: string
  public_title?: string | null
  county: string
  status: string
  featured?: boolean
  seller_email: string | null
}

type EnquiryRow = {
  id: number
  listing_slug: string
  listing_title: string
  name: string
  email: string
  phone: string | null
  message: string
  created_at: string
}

function formatDateTime(value?: string | null) {
  if (!value) return "—"

  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return "—"
  }

  return new Intl.DateTimeFormat("en-IE", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date)
}

export default async function EnquiriesPage({
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
      .select("*")
      .eq("seller_email", trimmedEmail)
      .order("created_at", { ascending: false })

    if (listingsError) {
      errorMessage = listingsError.message
    } else {
      listings = ((listingData ?? []) as ListingRow[]).map((listing) =>
        normalizeListingStatus(listing)
      )

      const slugs = listings.map((listing) => listing.slug)

      if (slugs.length > 0) {
        const { data: enquiryData, error: enquiriesError } = await supabase
          .from("enquiries")
          .select("*")
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

  const listingMap = new Map(listings.map((listing) => [listing.slug, listing]))

  return (
    <main className="min-h-screen bg-white">
      <section className="mx-auto max-w-6xl px-6 py-12">
        <div className="mb-10">
          <p className="text-sm font-medium uppercase tracking-[0.24em] text-slate-500">
            OpenList
          </p>
          <h1 className="mt-2 text-4xl font-semibold tracking-tight text-slate-900">
            Enquiries
          </h1>
          <p className="mt-3 max-w-2xl text-lg text-slate-600">
            View buyer enquiries across all listings linked to your seller email.
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
                View enquiries
              </button>

              {trimmedEmail && (
                <Link
                  href={`/my-listings?email=${encodeURIComponent(trimmedEmail)}`}
                  className="inline-flex h-12 items-center rounded-full border border-slate-300 bg-white px-6 text-sm font-medium text-slate-900 transition hover:bg-slate-100"
                >
                  Back to dashboard
                </Link>
              )}
            </div>
          </form>
        </div>

        {!trimmedEmail ? (
          <div className="mt-8 rounded-[28px] border border-slate-200 bg-white p-8 text-center shadow-sm">
            <h2 className="text-2xl font-semibold text-slate-900">
              Enter your email to view enquiries
            </h2>
            <p className="mt-3 text-slate-600">
              This MVP view shows enquiries for all listings linked to your seller email.
            </p>
          </div>
        ) : errorMessage ? (
          <div className="mt-8 rounded-2xl border border-red-200 bg-red-50 p-6 text-red-700">
            Database error: {errorMessage}
          </div>
        ) : enquiries.length > 0 ? (
          <div className="mt-8 space-y-5">
            {enquiries.map((enquiry) => {
              const listing = listingMap.get(enquiry.listing_slug)

              return (
                <div
                  key={enquiry.id}
                  className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm"
                >
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <p className="text-sm uppercase tracking-[0.18em] text-slate-500">
                        Enquiry
                      </p>
                      <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">
                        {enquiry.name}
                      </h2>
                    </div>

                    <div className="text-sm text-slate-500">
                      {formatDateTime(enquiry.created_at)}
                    </div>
                  </div>

                  <div className="mt-6 grid gap-4 md:grid-cols-3">
                    <div className="rounded-2xl bg-slate-50 p-4">
                      <p className="text-xs uppercase tracking-wide text-slate-500">
                        Property
                      </p>
                      <p className="mt-2 font-medium text-slate-900">
                        {listing ? getDisplayListingTitle(listing) : enquiry.listing_title}
                      </p>
                      {listing && (
                        <p className="mt-1 text-sm text-slate-500">
                          {listing.county} • {listing.status}
                        </p>
                      )}
                    </div>

                    <div className="rounded-2xl bg-slate-50 p-4">
                      <p className="text-xs uppercase tracking-wide text-slate-500">
                        Email
                      </p>
                      <p className="mt-2 break-all font-medium text-slate-900">
                        {enquiry.email}
                      </p>
                    </div>

                    <div className="rounded-2xl bg-slate-50 p-4">
                      <p className="text-xs uppercase tracking-wide text-slate-500">
                        Phone
                      </p>
                      <p className="mt-2 font-medium text-slate-900">
                        {enquiry.phone || "Not provided"}
                      </p>
                    </div>
                  </div>

                  <div className="mt-5 rounded-2xl bg-slate-50 p-5">
                    <p className="text-xs uppercase tracking-wide text-slate-500">
                      Message
                    </p>
                    <p className="mt-3 whitespace-pre-wrap leading-7 text-slate-700">
                      {enquiry.message}
                    </p>
                  </div>

                  <div className="mt-6 flex flex-wrap gap-3">
                    <a
                      href={`mailto:${enquiry.email}`}
                      className="inline-flex items-center rounded-full bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-700"
                    >
                      Reply by email
                    </a>

                    {listing && (
                      <>
                        <Link
                          href={`/listings/${listing.slug}`}
                          className="inline-flex items-center rounded-full border border-slate-300 px-4 py-2 text-sm font-medium text-slate-900 transition hover:bg-slate-100"
                        >
                          View listing
                        </Link>

                        <Link
                          href={`/listings/${listing.slug}/edit`}
                          className="inline-flex items-center rounded-full border border-slate-300 px-4 py-2 text-sm font-medium text-slate-900 transition hover:bg-slate-100"
                        >
                          Edit listing
                        </Link>
                      </>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          <div className="mt-8 rounded-[28px] border border-slate-200 bg-white p-8 text-center shadow-sm">
            <h2 className="text-2xl font-semibold text-slate-900">
              No enquiries found
            </h2>
            <p className="mt-3 text-slate-600">
              We couldn’t find any enquiries for{" "}
              <span className="font-medium">{trimmedEmail}</span>.
            </p>
          </div>
        )}
      </section>
    </main>
  )
}
