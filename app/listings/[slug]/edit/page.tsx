import Link from "next/link"
import { notFound } from "next/navigation"
import { supabase } from "@/lib/supabase"
import EnquiryForm from "./EnquiryForm"
import ListingGallery from "./ListingGallery"
import CopyListingLinkButton from "@/components/CopyListingLinkButton"
import { formatLocation, getAreaDisplay } from "@/lib/property"

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
      <main className="min-h-screen bg-white p-10">
        <h1 className="text-2xl font-semibold text-slate-900">Database error</h1>
        <p className="mt-3 text-slate-600">{error.message}</p>
      </main>
    )
  }

  if (!listing) {
    notFound()
  }

  const formattedPrice = formatEuro(listing.price)
  const images =
    listing.images && listing.images.length > 0
      ? listing.images
      : listing.image
        ? [listing.image]
        : []

  const dashboardEmail = email || listing.seller_email || ""
  const location = formatLocation(listing.address_line_2, listing.county)
  const areaDisplay = getAreaDisplay({
    type: listing.type,
    areaValue: listing.area_value,
    areaUnit: listing.area_unit,
  })

  return (
    <main className="min-h-screen bg-white">
      <section className="mx-auto max-w-6xl px-6 py-10">
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

        <div className="mb-6">
          <p className="text-sm uppercase tracking-[0.2em] text-slate-500">
            {listing.status} • {listing.type}
          </p>

          <h1 className="mt-2 text-4xl font-semibold tracking-tight text-slate-900">
            {listing.title}
          </h1>

          <p className="mt-3 text-lg text-slate-600">{location}</p>

          <div className="mt-3 flex flex-wrap gap-2">
            {listing.sale_method && (
              <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-sm text-slate-700">
                {listing.sale_method}
              </span>
            )}

            {listing.highlights?.map((highlight: string) => (
              <span
                key={highlight}
                className="inline-flex items-center rounded-full border border-slate-200 bg-white px-3 py-1 text-sm text-slate-700"
              >
                {highlight}
              </span>
            ))}
          </div>

          <div className="mt-5 flex flex-wrap gap-3">
            <Link
              href={`/listings/${listing.slug}/edit`}
              className="inline-flex items-center rounded-full border border-slate-300 px-4 py-2 text-sm font-medium text-slate-900 transition hover:bg-slate-100"
            >
              Edit listing
            </Link>

            {dashboardEmail && (
              <Link
                href={`/my-listings?email=${encodeURIComponent(dashboardEmail)}`}
                className="inline-flex items-center rounded-full border border-slate-300 px-4 py-2 text-sm font-medium text-slate-900 transition hover:bg-slate-100"
              >
                Dashboard
              </Link>
            )}

            <CopyListingLinkButton slug={listing.slug} />

            <Link
              href="/listings"
              className="inline-flex items-center rounded-full border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
            >
              Back to listings
            </Link>
          </div>
        </div>

        <ListingGallery images={images} title={listing.title} />

        <div className="grid gap-10 lg:grid-cols-[2fr_1fr]">
          <div>
            {listing.excerpt && (
              <p className="text-xl leading-8 text-slate-700">
                {listing.excerpt}
              </p>
            )}

            <div className="mt-8">
              <h2 className="text-xl font-semibold text-slate-900">
                About this property
              </h2>
              <p className="mt-4 whitespace-pre-wrap leading-8 text-slate-700">
                {listing.description}
              </p>
            </div>
          </div>

          <div className="space-y-6">
            <aside className="rounded-3xl border border-slate-200 p-6 shadow-sm">
              <p className="text-3xl font-semibold text-slate-900">
                {formattedPrice}
              </p>

              <div className="mt-6 border-t border-slate-200 pt-6">
                <div className="grid gap-4 text-sm">
                  {(listing.type === "House" || listing.type === "Apartment") && (
                    <div className="grid grid-cols-3 gap-4">
                      <div className="rounded-2xl bg-slate-50 p-4">
                        <p className="text-xs uppercase tracking-wide text-slate-500">
                          Beds
                        </p>
                        <p className="mt-2 text-lg font-semibold text-slate-900">
                          {listing.beds ?? "—"}
                        </p>
                      </div>

                      <div className="rounded-2xl bg-slate-50 p-4">
                        <p className="text-xs uppercase tracking-wide text-slate-500">
                          Baths
                        </p>
                        <p className="mt-2 text-lg font-semibold text-slate-900">
                          {listing.baths ?? "—"}
                        </p>
                      </div>

                      <div className="rounded-2xl bg-slate-50 p-4">
                        <p className="text-xs uppercase tracking-wide text-slate-500">
                          Area
                        </p>
                        <p className="mt-2 text-sm font-semibold text-slate-900">
                          {areaDisplay}
                        </p>
                      </div>
                    </div>
                  )}

                  {listing.type === "Site" && (
                    <div className="grid grid-cols-1 gap-4">
                      <div className="rounded-2xl bg-slate-50 p-4">
                        <p className="text-xs uppercase tracking-wide text-slate-500">
                          Site area
                        </p>
                        <p className="mt-2 text-sm font-semibold text-slate-900">
                          {areaDisplay}
                        </p>
                      </div>
                    </div>
                  )}

                  {listing.type === "Commercial" && (
                    <div className="grid grid-cols-1 gap-4">
                      <div className="rounded-2xl bg-slate-50 p-4">
                        <p className="text-xs uppercase tracking-wide text-slate-500">
                          Area
                        </p>
                        <p className="mt-2 text-sm font-semibold text-slate-900">
                          {areaDisplay}
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className="mt-6 space-y-4 border-t border-slate-200 pt-6 text-sm">
                <div className="flex items-center justify-between gap-4">
                  <span className="text-slate-500">Local area</span>
                  <span className="font-medium text-slate-900">
                    {location || "—"}
                  </span>
                </div>

                <div className="flex items-center justify-between gap-4">
                  <span className="text-slate-500">Status</span>
                  <span className="font-medium text-slate-900">
                    {listing.status}
                  </span>
                </div>

                <div className="flex items-center justify-between gap-4">
                  <span className="text-slate-500">Type</span>
                  <span className="font-medium text-slate-900">
                    {listing.subtype || listing.type}
                  </span>
                </div>

                {listing.viewing && (
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-slate-500">Viewing</span>
                    <span className="font-medium text-slate-900">
                      {listing.viewing}
                    </span>
                  </div>
                )}

                {listing.sale_method && (
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-slate-500">Sale method</span>
                    <span className="font-medium text-slate-900">
                      {listing.sale_method}
                    </span>
                  </div>
                )}
              </div>
            </aside>

            <EnquiryForm
              listingSlug={listing.slug}
              listingTitle={listing.title}
            />
          </div>
        </div>
      </section>
    </main>
  )
}