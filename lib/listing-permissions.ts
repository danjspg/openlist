import { getCurrentUserIsAdmin } from "@/lib/admin-auth"
import { requireSellerUser } from "@/lib/seller-auth"
import { supabase } from "@/lib/supabase"

type ListingOwnershipRecord = {
  slug: string
  owner_user_id?: string | null
}

export async function canCurrentUserEditListing(listing: ListingOwnershipRecord) {
  const isAdmin = await getCurrentUserIsAdmin()

  if (isAdmin) return true
  if (!listing.owner_user_id) return false

  try {
    const user = await requireSellerUser()
    return user.id === listing.owner_user_id
  } catch {
    return false
  }
}

export async function requireListingOwnerOrAdmin(slug: string) {
  const { data: listing, error } = await supabase
    .from("listings")
    .select("slug,owner_user_id")
    .eq("slug", slug)
    .single<ListingOwnershipRecord>()

  if (error || !listing) {
    throw new Error(error?.message || "Listing not found")
  }

  const isAdmin = await getCurrentUserIsAdmin()
  if (isAdmin) {
    return { listing, isAdmin: true as const, user: null }
  }

  const user = await requireSellerUser()

  if (!listing.owner_user_id || listing.owner_user_id !== user.id) {
    throw new Error("Unauthorized")
  }

  return { listing, isAdmin: false as const, user }
}
