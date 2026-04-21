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
  subtype?: string | null
  address_line_2?: string | null
  highlights?: string[] | null
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

function extractDirectionalQualifier(values: Array<string | null | undefined>) {
  const text = values
    .filter(Boolean)
    .join(" ")
    .replace(/[-_/]/g, " ")

  const match = text.match(/\b(East|West|North|South|Upper|Lower)\b/i)
  return match ? match[1].charAt(0).toUpperCase() + match[1].slice(1).toLowerCase() : ""
}

export function getDisplayListingTitle(listing: {
  title?: string | null
  public_title?: string | null
  type?: string | null
  subtype?: string | null
  address_line_2?: string | null
  county?: string | null
  excerpt?: string | null
  description?: string | null
  highlights?: string[] | null
  slug?: string | null
}) {
  const publicTitle = listing.public_title?.trim()
  if (publicTitle) return publicTitle

  const fallbackTitle = listing.title?.trim() || "Property"
  if (listing.type !== "Site") return fallbackTitle

  const lead = (listing.subtype?.trim() || listing.type?.trim() || "").trim()
  const area = listing.address_line_2?.trim() || ""
  const qualifier = extractDirectionalQualifier([
    ...(listing.highlights ?? []),
    listing.excerpt,
    listing.description,
    listing.slug,
  ])

  if (!lead || !area) {
    return qualifier && !fallbackTitle.toLowerCase().includes(qualifier.toLowerCase())
      ? `${fallbackTitle} - ${qualifier}`
      : fallbackTitle
  }

  const rebuiltTitle = qualifier ? `${area} ${lead} - ${qualifier}` : `${area} ${lead}`
  return rebuiltTitle.trim() || fallbackTitle
}

export function getDisplayListingHighlights(highlights?: string[] | null) {
  if (!highlights || highlights.length === 0) {
    return []
  }

  return highlights.filter((highlight) => {
    const trimmed = highlight.trim()

    if (!trimmed) {
      return false
    }

    if (/^location\s*:/i.test(trimmed)) {
      return false
    }

    if (/^site area\s*:/i.test(trimmed)) {
      return false
    }

    return true
  })
}

function normaliseDisplayText(value?: string | null) {
  return (value || "")
    .toLowerCase()
    .replace(/["']/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
}

export function getDisplayListingExcerpt({
  title,
  excerpt,
}: {
  title?: string | null
  excerpt?: string | null
}) {
  const trimmedExcerpt = excerpt?.trim() || ""
  if (!trimmedExcerpt) {
    return ""
  }

  const normalisedTitle = normaliseDisplayText(title)
  const normalisedExcerpt = normaliseDisplayText(trimmedExcerpt)

  if (!normalisedTitle || !normalisedExcerpt) {
    return trimmedExcerpt
  }

  if (
    normalisedExcerpt === normalisedTitle ||
    normalisedExcerpt.startsWith(normalisedTitle) ||
    normalisedTitle.startsWith(normalisedExcerpt)
  ) {
    return ""
  }

  return trimmedExcerpt
}
