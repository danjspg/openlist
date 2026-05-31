import type { Metadata } from "next"
import { getServerSupabase } from "@/lib/supabase"
import {
  isPublicSaleStatus,
  normalizeListingStatus,
} from "@/lib/listing-status"
import ListingsPageClient, { type Listing } from "./ListingsPageClient"

export const metadata: Metadata = {
  title: "Property Listings Ireland | Homes for Sale",
  description:
    "Browse private property listings across Ireland, with homes and sites listed directly by sellers on OpenList.",
  alternates: {
    canonical: "/listings",
  },
  robots: {
    index: true,
    follow: true,
  },
}

export const revalidate = 300

export default async function ListingsPage() {
  const supabase = getServerSupabase()
  const { data } = await supabase
    .from("listings")
    .select("*")
    .order("created_at", { ascending: false })

  const listings = ((data ?? []) as Listing[])
    .map((listing) => normalizeListingStatus(listing))
    .filter((listing) => isPublicSaleStatus(listing.status))
    .sort((a, b) => Number(b.featured) - Number(a.featured))

  return <ListingsPageClient initialListings={listings} />
}
