import Link from "next/link"
import { notFound } from "next/navigation"
import { supabase } from "@/lib/supabase"
import EnquiryForm from "./EnquiryForm"
import ListingGallery from "./ListingGallery"
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

function formatNumber(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "—"
  }

  return new Intl.NumberFormat("en-IE").format(value)
}

function parsePostgresArrayString(value: string) {
  const trimmed = value.trim()

  if (!trimmed.startsWith("{") || !trimmed.endsWith("}")) {
    return null
  }

  const inner = trimmed.slice(1, -1).trim()
  if (!inner) {
    return []
  }

  const result: string[] = []
  let current = ""
  let inQuotes = false
  let escaping = false

  for (let i = 0; i < inner.length; i += 1) {
    const char = inner[i]

    if (escaping) {
      current += char
      escaping = false
      continue
    }

    if (char === "\\") {
      escaping = true
      continue
    }

    if (char === '"') {
      inQuotes = !inQuotes
      continue
    }

    if (char === "," && !inQuotes) {
      if (current.trim()) {
        result.push(current.trim())
      }
      current = ""
      continue
    }

    current += char
  }

  if (current.trim()) {
    result.push(current.trim())
  }

  return result
    .map((item) => item.trim())
    .filter((item) => item.length > 0)
}

function normaliseImages(imagesValue: unknown, fallbackImage?: string | null) {
  if (Array.isArray(imagesValue)) {
    return imagesValue.filter(
      (item): item is string => typeof item === "string" && item.trim().length > 0
    )
  }

  if (typeof imagesValue === "string" && imagesValue.trim().length > 0) {
    const trimmed = imagesValue.trim()

    try {
      const parsed = JSON.parse(trimmed)
      if (Array.isArray(parsed)) {
        return parsed.filter(
          (item): item is string => typeof item === "string" && item.trim().length > 0
        )
      }
    } catch {
      // ignore and continue
    }

    const postgresParsed = parsePostgresArrayString(trimmed)
    if (postgresParsed) {
      return postgresParsed
    }

    return [trimmed]
  }

  if (fallbackImage && fallbackImage.trim().length > 0) {
    return [fallbackImage]
  }

  return []
}

export default async function ListingPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ updated?: string; created?: string; email?: string }>
}) {
  const { slug } = await params
  const { updated, created, email } = await searchParams

  const { data: listing, error } = await supabase
    .from("listings")
    .select("*")
    .eq("slug", slug)
    .maybeSingle()

  if (error) {
    return (
      <main className="min-h-screen bg-stone-50 p-6 sm:p-10">
        <h1 className="text-2xl font-semibold text-stone-900">Database error</h1>
        <p className="mt-3 text-stone-600">{error.message}</p>
      </main>
    )
  }

  if (!listing) {
    notFound()
  }

  const isSite = listing.type === "Site"
  const formattedPrice = formatEuro(listing.price)
  const images = normaliseImages(listing.images, listing.image)
  const dashboardEmail = email || listing.seller_email || ""

  return (
    <main className="min-h-screen overflow-x-hidden bg-stone-50">
      <section className="mx-auto max-w-6xl overflow-x-hidden px-4 py-6 sm:px-6 sm:py-10">
        {created === "1" && (
          <div className="mb-6 rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-emerald-800">
            Listing created successfully.
          </div>
        )}

        {updated === "1" && (
          <div className="mb-6 rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-emerald-800">
            Listing updated successfully.
          </div>
        )}

        <div className="mb-5 overflow-hidden rounded-[28px] border border-stone-200 bg-white shadow-sm sm:mb-6 sm:rounded-[32px]">
          <div className="border-b border-stone-200 bg-gradient-to-br from-stone-50 via-white to-stone-100 px-4 py-5 sm:px-6 sm:py-6 md:px-8 md:py-7">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="max-w-3xl min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center rounded-full bg-stone-900 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-white">
                    {listing.status}
                  </span>

                  <span className="inline-flex items-center rounded-full border border-stone-200 bg-white px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-stone-600">
                    {listing.type}
                  </span>

                  {listing.subtype && (
                    <span className="inline-flex items-center rounded-full border border-stone-200 bg-white px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-stone-600">
                      {listing.subtype}
                    </span>
                  )}
                </div>

                <h1 className="mt-3 break-words text-2xl font-semibold tracking-tight text-stone-900 sm:mt-4 sm:text-4xl md:text-[2.7rem]">
                  {listing.title}
                </h1>

                <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-stone-600 sm:mt-4">
                  <div className="inline-flex items-center text-sm sm:text-base md:text-lg">
                    <svg
                      className="mr-2 h-4 w-4 text-stone-400"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <path d="M12 21s-6-5.33-6-11a6 6 0 1 1 12 0c0 5.67-6 11-6 11Z" />
                      <circle cx="12" cy="10" r="2.5" />
                    </svg>
                    <span>
                      {listing.address_line_2 ? `${listing.address_line_2}, ` : ""}
                      {listing.county}
                    </span>
                  </div>

                  <div className="hidden h-1 w-1 rounded-full bg-stone-300 md:block" />

                  <div className="text-sm font-medium text-stone-500">
                    Private seller listing
                  </div>
                </div>
              </div>

              <div className="w-full rounded-[24px] border border-stone-200 bg-white px-4 py-4 shadow-sm sm:w-auto sm:min-w-[220px] sm:px-5">
                <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-stone-500">
                  Guide price
                </div>
                <div className="mt-2 text-2xl font-semibold tracking-tight text-stone-900 sm:text-3xl md:text-4xl">
                  {formattedPrice}
                </div>
              </div>
            </div>
          </div>

          <div className="px-4 py-4 sm:px-6 md:px-8">
            <div className="flex flex-wrap gap-2.5 sm:gap-3">
              <Link
                href={`/listings/${listing.slug}/edit`}
                className="inline-flex items-center rounded-full bg-stone-900 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-stone-700 sm:px-5"
              >
                <svg
                  className="mr-2 h-4 w-4"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M12 20h9" />
                  <path d="M16.5 3.5a2.1 2.1 0 1 1 3 3L7 19l-4 1 1-4 12.5-12.5Z" />
                </svg>
                Edit listing
              </Link>

              {dashboardEmail && (
                <Link
                  href={`/my-listings?email=${encodeURIComponent(dashboardEmail)}`}
                  className="inline-flex items-center rounded-full border border-stone-300 bg-white px-4 py-2.5 text-sm font-medium text-stone-700 shadow-sm transition hover:bg-stone-50 sm:px-5"
                >
                  <svg
                    className="mr-2 h-4 w-4 text-stone-500"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <rect x="3" y="3" width="7" height="7" rx="1.5" />
                    <rect x="14" y="3" width="7" height="7" rx="1.5" />
                    <rect x="14" y="14" width="7" height="7" rx="1.5" />
                    <rect x="3" y="14" width="7" height="7" rx="1.5" />
                  </svg>
                  Dashboard
                </Link>
              )}

              <CopyListingLinkButton slug={listing.slug} />

              <Link
                href="/listings"
                className="inline-flex items-center rounded-full border border-stone-200 bg-white px-4 py-2.5 text-sm font-medium text-stone-700 transition hover:bg-stone-50 sm:px-5"
              >
                <svg
                  className="mr-2 h-4 w-4 text-stone-400"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="m15 18-6-6 6-6" />
                </svg>
                View listings
              </Link>
            </div>
          </div>
        </div>

        <div className="grid gap-6 sm:gap-8 lg:grid-cols-[minmax(0,1.55fr)_360px]">
          <div className="min-w-0">
            <ListingGallery images={images} title={listing.title} />

            <div className="min-w-0 overflow-hidden rounded-[28px] border border-stone-200 bg-white p-5 shadow-sm sm:rounded-[32px] sm:p-6 md:p-8">
              <p className="break-words text-base leading-7 text-stone-700 sm:text-lg sm:leading-8">
                {listing.excerpt}
              </p>

              <div className="mt-8">
                <h2 className="text-xl font-semibold text-stone-900">
                  About this property
                </h2>
                <div className="mt-4 whitespace-pre-line break-words leading-7 text-stone-700 sm:leading-8">
                  {listing.description}
                </div>
              </div>

              <div className="mt-8 rounded-2xl border border-stone-200 bg-stone-50 px-5 py-4">
                <p className="text-sm leading-6 text-stone-600">
                  These details are provided by the seller and have not been independently verified.
                  All information is for guidance only, and interested parties should satisfy
                  themselves as to accuracy.
                </p>
                <p className="mt-3 text-sm leading-6 text-stone-600">
                  OpenList acts as a marketing platform and does not provide valuation,
                  negotiation, conveyancing, or legal services.
                </p>
              </div>
            </div>
          </div>

          <div className="space-y-5 sm:space-y-6 lg:sticky lg:top-24 lg:self-start">
            <aside className="rounded-3xl border border-stone-200 bg-white p-5 shadow-sm sm:p-6">
              <p className="text-2xl font-semibold text-stone-900 sm:text-3xl">
                {formattedPrice}
              </p>

              <div className="mt-3 inline-flex items-center rounded-full border border-stone-200 bg-stone-50 px-3 py-1.5 text-xs font-medium text-stone-700">
                Direct to seller
                <span className="mx-2 h-1 w-1 rounded-full bg-stone-300" />
                No agent fees
              </div>

              <div className="mt-5 border-t border-stone-200 pt-5 sm:mt-6 sm:pt-6">
                {isSite ? (
                  <div className="grid grid-cols-2 gap-3 text-sm sm:gap-4">
                    <div className="rounded-2xl bg-stone-50 p-4">
                      <p className="text-xs uppercase tracking-wide text-stone-500">
                        Site Area
                      </p>
                      <p className="mt-2 text-lg font-semibold text-stone-900">
                        {formatNumber(listing.sqft)}
                      </p>
                    </div>

                    <div className="rounded-2xl bg-stone-50 p-4">
                      <p className="text-xs uppercase tracking-wide text-stone-500">
                        Planning
                      </p>
                      <p className="mt-2 text-lg font-semibold text-stone-900">
                        {listing.planning || "—"}
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-3 gap-3 text-sm sm:gap-4">
                    <div className="rounded-2xl bg-stone-50 p-4">
                      <p className="text-xs uppercase tracking-wide text-stone-500">
                        Beds
                      </p>
                      <p className="mt-2 text-lg font-semibold text-stone-900">
                        {formatNumber(listing.beds)}
                      </p>
                    </div>

                    <div className="rounded-2xl bg-stone-50 p-4">
                      <p className="text-xs uppercase tracking-wide text-stone-500">
                        Baths
                      </p>
                      <p className="mt-2 text-lg font-semibold text-stone-900">
                        {formatNumber(listing.baths)}
                      </p>
                    </div>

                    <div className="rounded-2xl bg-stone-50 p-4">
                      <p className="text-xs uppercase tracking-wide text-stone-500">
                        Sq Ft
                      </p>
                      <p className="mt-2 text-lg font-semibold text-stone-900">
                        {formatNumber(listing.sqft)}
                      </p>
                    </div>
                  </div>
                )}
              </div>

              <div className="mt-5 space-y-4 border-t border-stone-200 pt-5 text-sm sm:mt-6 sm:pt-6">
                <div className="flex items-center justify-between gap-4">
                  <span className="text-stone-500">County</span>
                  <span className="font-medium text-stone-900">
                    {listing.county}
                  </span>
                </div>

                <div className="flex items-center justify-between gap-4">
                  <span className="text-stone-500">Status</span>
                  <span className="font-medium text-stone-900">
                    {listing.status}
                  </span>
                </div>

                <div className="flex items-center justify-between gap-4">
                  <span className="text-stone-500">Type</span>
                  <span className="font-medium text-stone-900">
                    {listing.type}
                  </span>
                </div>

                {listing.viewing && (
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-stone-500">Viewing</span>
                    <span className="font-medium text-stone-900">
                      {listing.viewing}
                    </span>
                  </div>
                )}

                {isSite && listing.planning && (
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-stone-500">Planning</span>
                    <span className="font-medium text-stone-900">
                      {listing.planning}
                    </span>
                  </div>
                )}
              </div>
            </aside>

            <div className="rounded-3xl border border-stone-200 bg-white p-5 shadow-sm sm:p-6">
              <div className="mb-4">
                <h3 className="text-lg font-semibold text-stone-900">
                  Enquire about this property
                </h3>
                <p className="mt-2 text-sm leading-6 text-stone-500">
                  Send a direct enquiry to the seller. Responses go straight to the listing owner.
                </p>
              </div>

              <EnquiryForm
                listingSlug={listing.slug}
                listingTitle={listing.title}
              />
            </div>
          </div>
        </div>
      </section>
    </main>
  )
}