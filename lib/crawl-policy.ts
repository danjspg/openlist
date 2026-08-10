export const PLANNING_UTILITY_QUERY_KEYS = [
  "q",
  "area",
  "council",
  "status",
  "type",
] as const

export type UtilityCrawlPolicy = {
  canonicalPath: string
  robots: "noindex, follow"
}

export function getUtilityCrawlPolicy(
  pathname: string,
  searchParams: Pick<URLSearchParams, "has">
): UtilityCrawlPolicy | null {
  if (
    (pathname === "/planning" || pathname.startsWith("/planning/")) &&
    PLANNING_UTILITY_QUERY_KEYS.some((key) => searchParams.has(key))
  ) {
    return { canonicalPath: pathname, robots: "noindex, follow" }
  }

  if (pathname === "/search" && searchParams.has("q")) {
    return { canonicalPath: "/search", robots: "noindex, follow" }
  }

  return null
}
