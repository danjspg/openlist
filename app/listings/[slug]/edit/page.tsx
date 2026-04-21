import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { supabase } from "@/lib/supabase"
import SellerListingV2Form from "@/components/SellerListingV2Form"
import { updateListing } from "@/app/sell/actions"
import { normalizeListingStatus } from "@/lib/listing-status"

type Props = {
  params: Promise<{ slug: string }>
}

export const metadata: Metadata = {
  title: "Edit Listing | OpenList",
  robots: {
    index: false,
    follow: false,
  },
}

export default async function EditListingPage({ params }: Props) {
  const { slug } = await params

  const { data: listing, error } = await supabase
    .from("listings")
    .select("*")
    .eq("slug", slug)
    .single()

  if (error || !listing) {
    notFound()
  }

  const normalizedListing = normalizeListingStatus(listing)

  return (
    <main className="min-h-screen bg-white">
      <section className="mx-auto max-w-4xl px-6 py-12">
        <div className="mb-10">
          <p className="text-sm font-medium uppercase tracking-[0.24em] text-slate-500">
            OpenList
          </p>

          <h1 className="mt-2 text-4xl font-semibold tracking-tight text-slate-900">
            Edit listing
          </h1>

          <p className="mt-3 text-slate-600">
            Update the structured details, copy and images for this listing.
          </p>
        </div>

        <SellerListingV2Form
          mode="edit"
          submitAction={updateListing}
          initialData={{
            slug: listing.slug,
            sellerEmail: normalizedListing.seller_email ?? "",
            type: normalizedListing.type ?? "House",
            subtype: normalizedListing.subtype ?? "",
            saleMethod: normalizedListing.sale_method ?? "Private Sale",
            county: normalizedListing.county ?? "Cork",
            addressLine2: normalizedListing.address_line_2 ?? "",
            eircode: normalizedListing.eircode ?? "",
            publicTitle: normalizedListing.public_title ?? "",
            price: normalizedListing.price ?? "",
            beds: normalizedListing.beds ?? 0,
            baths: normalizedListing.baths ?? 0,
            areaValue: normalizedListing.area_value ?? null,
            areaUnit: normalizedListing.area_unit ?? "",
            excerpt: normalizedListing.excerpt ?? "",
            description: normalizedListing.description ?? "",
            status: normalizedListing.status ?? "For Sale",
            highlights: normalizedListing.highlights ?? [],
            images:
              normalizedListing.images && normalizedListing.images.length > 0
                ? normalizedListing.images
                : normalizedListing.image
                  ? [normalizedListing.image]
                  : [],
          }}
        />
      </section>
    </main>
  )
}
