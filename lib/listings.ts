export type Listing = {
  id?: number
  slug: string
  seller_email?: string | null
  title: string
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
