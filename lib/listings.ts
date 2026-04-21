export type Listing = {
  id?: number
  slug: string
  seller_email?: string | null
  title: string
  public_title?: string | null
  county: string
  price: string
  beds: number
  baths: number
  sqft: number
  image: string
  images?: string[] | null
  excerpt: string
  description: string
  status: string
  featured?: boolean
  type: string
  planning?: string | null
  viewing?: string | null
  created_at?: string
}

function slugify(input: string) {
  return input
    .toLowerCase()
    .trim()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
}

export function buildSlug(title: string) {
  return slugify(title)
}

export function getPublicListingTitle(listing: {
  title?: string | null
  public_title?: string | null
}) {
  const publicTitle = listing.public_title?.trim()
  if (publicTitle) return publicTitle
  return listing.title?.trim() || "Property"
}
