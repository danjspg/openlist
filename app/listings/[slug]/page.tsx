import Link from "next/link"
import { notFound } from "next/navigation"
import { supabase } from "@/lib/supabase"
import { formatCompactSiteArea } from "@/lib/property"
import EnquiryForm from "./EnquiryForm"
import ListingGallery from "./ListingGallery"
import CopyListingLinkButton from "@/components/CopyListingLinkButton"
import {
  formatPprCurrency,
  formatPprDate,
  getComparableSaleDisplayLabel,
  getNearbySalesForListing,
} from "@/lib/ppr"
import { isPublicSaleStatus, normalizeListingStatus } from "@/lib/listing-status"
import { getCurrentUserIsAdmin } from "@/lib/admin-auth"
import AdminFeaturedToggle from "@/components/AdminFeaturedToggle"
import { getDisplayListingTitle } from "@/lib/listings"
import { canCurrentUserEditListing } from "@/lib/listing-permissions"

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

  const normalizedListing = normalizeListingStatus(listing)
  if (!isPublicSaleStatus(normalizedListing.status)) {
    notFound()
  }
  const isAdmin = await getCurrentUserIsAdmin()
  const canEditListing = await canCurrentUserEditListing(normalizedListing)
  const displayTitle = getDisplayListingTitle(normalizedListing)

  const isSite = normalizedListing.type === "Site"
  const formattedPrice = formatEuro(normalizedListing.price)
  const images = normaliseImages(normalizedListing.images, normalizedListing.image)
  const dashboardEmail = email || normalizedListing.seller_email || ""
  const nearbySales = await getNearbySalesForListing({
    county: normalizedListing.county,
    area: normalizedListing.address_line_2,
  })
  const compactSiteAreaDisplay = formatCompactSiteArea({
    areaValue: normalizedListing.area_value,
    areaUnit: normalizedListing.area_unit,
  })

  return (
    <main className="min-h-screen overflow-x-hidden bg-stone-50">
      <section className="mx-auto max-w-6xl overflow-x-hidden px-4 py-6 pb-28 sm:px-6 sm:py-10 sm:pb-10">
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
                    {normalizedListing.status}
                  </span>
                  {normalizedListing.featured && (
                    <span className="inline-flex items-center rounded-full bg-white px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-stone-700">
                      Featured
                    </span>
                  )}

                  <span className="inline-flex items-center rounded-full border border-stone-200 bg-white px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-stone-600">
                    {normalizedListing.type}
                  </span>

                  {normalizedListing.subtype && (
                    <span className="inline-flex items-center rounded-full border border-stone-200 bg-white px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-stone-600">
                      {normalizedListing.subtype}
                    </span>
                  )}
                </div>

                <h1 className="mt-3 break-words text-2xl font-semibold tracking-tight text-stone-900 sm:mt-4 sm:text-4xl md:text-[2.7rem]">
                  {displayTitle}
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
                      {normalizedListing.address_line_2 ? `${normalizedListing.address_line_2}, ` : ""}
                      {normalizedListing.county}
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
            {/* Mobile actions */}
            <div className="flex flex-col gap-2.5 sm:hidden">
              <a
                href="#enquiry-form"
                className="inline-flex w-full items-center justify-center rounded-full bg-stone-900 px-4 py-3 text-sm font-medium text-white shadow-sm transition hover:bg-stone-700"
              >
                Enquire now
              </a>

              <div className={`grid gap-2.5 ${isAdmin ? "grid-cols-2" : "grid-cols-1"}`}>
                {canEditListing && (
                  <Link
                    href={`/listings/${normalizedListing.slug}/edit`}
                    className="inline-flex items-center justify-center rounded-full border border-stone-300 bg-white px-3 py-2.5 text-xs font-medium text-stone-700 shadow-sm transition hover:bg-stone-50"
                  >
                    Edit
                  </Link>
                )}
                <Link
                  href="/listings"
                  className="inline-flex items-center justify-center rounded-full border border-stone-300 bg-white px-3 py-2.5 text-xs font-medium text-stone-700 shadow-sm transition hover:bg-stone-50"
                >
                  View listings
                </Link>
              </div>
            </div>

            {/* Desktop actions */}
            <div className="hidden flex-wrap gap-2.5 sm:flex sm:gap-3">
              {canEditListing && (
                <Link
                  href={`/listings/${normalizedListing.slug}/edit`}
                  className="inline-flex items-center rounded-full bg-stone-900 px-4 py-2 text-sm font-medium text-white shadow-[0_1px_2px_rgba(0,0,0,0.08)] transition hover:bg-stone-700"
                >
                  <svg
                    className="mr-2 h-3.5 w-3.5"
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
              )}

              {dashboardEmail && (
                <Link
                  href={`/my-listings?email=${encodeURIComponent(dashboardEmail)}`}
                  className="inline-flex items-center rounded-full border border-stone-300 bg-white px-4 py-2 text-sm font-medium text-stone-700 shadow-[0_1px_2px_rgba(0,0,0,0.04)] transition hover:bg-stone-50"
                >
                  <svg
                    className="mr-2 h-3.5 w-3.5 text-stone-500"
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

              <CopyListingLinkButton slug={normalizedListing.slug} />

              <Link
                href="/listings"
                className="inline-flex items-center rounded-full border border-stone-200 bg-white px-4 py-2 text-sm font-medium text-stone-700 shadow-[0_1px_2px_rgba(0,0,0,0.04)] transition hover:bg-stone-50"
              >
                <svg
                  className="mr-2 h-3.5 w-3.5 text-stone-400"
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
            <ListingGallery images={images} title={displayTitle} />

            <div className="min-w-0 overflow-hidden rounded-[28px] border border-stone-200 bg-white p-5 shadow-sm sm:rounded-[32px] sm:p-6 md:p-8">
              <p className="break-words text-base leading-7 text-stone-700 sm:text-lg sm:leading-8">
                {normalizedListing.excerpt}
              </p>

              <div className="mt-8">
                <h2 className="text-xl font-semibold text-stone-900">
                  About this property
                </h2>
                <div className="mt-4 whitespace-pre-line break-words leading-7 text-stone-700 sm:leading-8">
                  {normalizedListing.description}
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

            {nearbySales.length > 0 && (
              <section className="mt-6 rounded-[28px] border border-stone-200 bg-white p-5 shadow-sm sm:rounded-[32px] sm:p-6 md:p-8">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="text-sm font-semibold uppercase tracking-[0.2em] text-stone-500">
                      Public sales register
                    </p>
                    <h2 className="mt-2 text-2xl font-semibold tracking-tight text-stone-900">
                      Recent sale prices nearby
                    </h2>
                    <p className="mt-3 max-w-2xl text-sm leading-6 text-stone-600">
                      Public Property Price Register sales can provide useful
                      local context. They are not a formal valuation or official
                      price index.
                    </p>
                  </div>

                  <Link
                    href="/sold-prices"
                    className="inline-flex shrink-0 rounded-full border border-stone-300 px-4 py-2.5 text-sm font-medium text-stone-700 transition hover:border-stone-900 hover:text-stone-900"
                  >
                    Browse sold prices
                  </Link>
                </div>

                <div className="mt-5 grid gap-3">
                  {nearbySales.map((sale) => (
                    <div
                      key={sale.id}
                      className="rounded-2xl border border-stone-200 bg-stone-50 px-4 py-4"
                    >
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <p className="max-w-[34rem] text-pretty font-medium leading-6 text-stone-900">
                            {getComparableSaleDisplayLabel(sale)}
                          </p>
                          <p className="mt-1 text-sm text-stone-500">
                            {formatPprDate(sale.date_of_sale)}
                          </p>
                        </div>
                        <p className="text-xl font-semibold text-stone-900">
                          {formatPprCurrency(sale.price_eur)}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </div>

          <div className="space-y-5 sm:space-y-6 lg:sticky lg:top-24 lg:self-start">
            {isAdmin && (
              <AdminFeaturedToggle
                slug={normalizedListing.slug}
                featured={normalizedListing.featured}
              />
            )}

            <aside className="rounded-3xl border border-stone-200 bg-white p-5 shadow-sm sm:p-6">
              <p className="text-2xl font-semibold text-stone-900 sm:text-3xl">
                {formattedPrice}
              </p>

              <div className="mt-3 inline-flex items-center rounded-full border border-stone-200 bg-stone-50 px-3 py-1.5 text-xs font-medium text-stone-700">
                Private Sale
              </div>

              <div className="mt-5 border-t border-stone-200 pt-5 sm:mt-6 sm:pt-6">
                {isSite ? (
                  <div className="grid grid-cols-2 gap-3 text-sm sm:gap-4">
                    <div className="rounded-2xl bg-stone-50 p-4">
                      <p className="text-xs uppercase tracking-wide text-stone-500">
                        Site Area
                      </p>
                      <p className="mt-2 text-base font-semibold leading-6 text-stone-900">
                        {compactSiteAreaDisplay}
                      </p>
                    </div>

                    <div className="rounded-2xl bg-stone-50 p-4">
                      <p className="text-xs uppercase tracking-wide text-stone-500">
                        Planning
                      </p>
                      <p className="mt-2 text-lg font-semibold text-stone-900">
                        {normalizedListing.planning || "—"}
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
                        {formatNumber(normalizedListing.beds)}
                      </p>
                    </div>

                    <div className="rounded-2xl bg-stone-50 p-4">
                      <p className="text-xs uppercase tracking-wide text-stone-500">
                        Baths
                      </p>
                      <p className="mt-2 text-lg font-semibold text-stone-900">
                        {formatNumber(normalizedListing.baths)}
                      </p>
                    </div>

                    <div className="rounded-2xl bg-stone-50 p-4">
                      <p className="text-xs uppercase tracking-wide text-stone-500">
                        Sq Ft
                      </p>
                      <p className="mt-2 text-lg font-semibold text-stone-900">
                        {formatNumber(normalizedListing.sqft)}
                      </p>
                    </div>
                  </div>
                )}
              </div>

              <div className="mt-5 space-y-4 border-t border-stone-200 pt-5 text-sm sm:mt-6 sm:pt-6">
                <div className="flex items-center justify-between gap-4">
                  <span className="text-stone-500">County</span>
                  <span className="font-medium text-stone-900">
                    {normalizedListing.county}
                  </span>
                </div>

                <div className="flex items-center justify-between gap-4">
                  <span className="text-stone-500">Status</span>
                  <span className="font-medium text-stone-900">
                    {normalizedListing.status}
                  </span>
                </div>

                {normalizedListing.featured && (
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-stone-500">Featured Listing</span>
                    <span className="font-medium text-stone-900">On</span>
                  </div>
                )}

                <div className="flex items-center justify-between gap-4">
                  <span className="text-stone-500">Type</span>
                  <span className="font-medium text-stone-900">
                    {normalizedListing.type}
                  </span>
                </div>

                {normalizedListing.viewing && (
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-stone-500">Viewing</span>
                    <span className="font-medium text-stone-900">
                      {normalizedListing.viewing}
                    </span>
                  </div>
                )}

              </div>
            </aside>

            <div
              id="enquiry-form"
              className="rounded-3xl border border-stone-200 bg-white p-5 shadow-sm sm:p-6"
            >
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
                listingTitle={displayTitle}
              />
            </div>
          </div>
        </div>
      </section>

      {/* Sticky mobile enquiry bar */}
      <div className="fixed inset-x-4 bottom-4 z-40 sm:hidden">
        <a
          href="#enquiry-form"
          className="inline-flex w-full items-center justify-center rounded-full bg-stone-900 px-5 py-3.5 text-sm font-medium text-white shadow-[0_12px_30px_rgba(15,23,42,0.22)] transition hover:bg-stone-700"
        >
          Enquire now
        </a>
      </div>
    </main>
  )
}
