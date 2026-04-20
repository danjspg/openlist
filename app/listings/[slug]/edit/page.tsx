import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { supabase } from "@/lib/supabase"
import SellerListingV2Form from "@/components/SellerListingV2Form"
import { updateListing } from "@/app/sell/actions"

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
            sellerEmail: listing.seller_email ?? "",
            type: listing.type ?? "House",
            subtype: listing.subtype ?? "",
            saleMethod: listing.sale_method ?? "Private Sale",
            county: listing.county ?? "Cork",
            addressLine2: listing.address_line_2 ?? "",
            eircode: listing.eircode ?? "",
            price: listing.price ?? "",
            beds: listing.beds ?? 0,
            baths: listing.baths ?? 0,
            areaValue: listing.area_value ?? null,
            areaUnit: listing.area_unit ?? "",
            excerpt: listing.excerpt ?? "",
            description: listing.description ?? "",
            status: listing.status ?? "For Sale",
            highlights: listing.highlights ?? [],
            images:
              listing.images && listing.images.length > 0
                ? listing.images
                : listing.image
                  ? [listing.image]
                  : [],
          }}
        />
      </section>
    </main>
  )
}
