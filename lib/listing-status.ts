export const OWNER_SALE_STATUSES = [
  "Draft",
  "For Sale",
  "Sale Agreed",
  "Sold",
  "Paused",
  "Archived",
] as const

export const PUBLIC_SALE_STATUSES = [
  "For Sale",
  "Sale Agreed",
  "Sold",
] as const

export type SaleStatus = (typeof OWNER_SALE_STATUSES)[number]

type ListingStatusLike = {
  status?: unknown
  featured?: unknown
}

function isSaleStatus(value: string): value is SaleStatus {
  return OWNER_SALE_STATUSES.includes(value as SaleStatus)
}

export function normalizeSaleStatus(status: unknown): SaleStatus {
  if (typeof status !== "string") return "For Sale"

  const trimmed = status.trim()

  if (trimmed === "Featured") return "For Sale"
  if (isSaleStatus(trimmed)) return trimmed

  return "For Sale"
}

export function normalizeFeaturedFlag(featured: unknown, status?: unknown) {
  if (typeof featured === "boolean") return featured || status === "Featured"
  return status === "Featured"
}

export function normalizeListingStatus<T extends ListingStatusLike>(listing: T) {
  return {
    ...listing,
    status: normalizeSaleStatus(listing.status),
    featured: normalizeFeaturedFlag(listing.featured, listing.status),
  } as T & { status: SaleStatus; featured: boolean }
}

export function isPublicSaleStatus(status: unknown): status is (typeof PUBLIC_SALE_STATUSES)[number] {
  return PUBLIC_SALE_STATUSES.includes(normalizeSaleStatus(status) as (typeof PUBLIC_SALE_STATUSES)[number])
}

export function isLiveSaleStatus(status: unknown) {
  return normalizeSaleStatus(status) === "For Sale"
}
