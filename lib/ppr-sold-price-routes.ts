import { PPR_MARKETS, type PprMarket } from "@/lib/ppr-markets"

export const CURATED_PPR_AREA_SITEMAP_SLUGS = [
  "trim",
  "drogheda",
  "carrigaline",
  "cobh",
  "tramore",
] as const

type CanonicalAreaRoute = {
  sourceSlug: string
  countySlug: string
  areaSlug: string
  destination: string
}

function routeSlug(value: string) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/['']/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
}

function canonicalAreaRouteForMarket(market: PprMarket): CanonicalAreaRoute | null {
  if (market.marketType !== "town_suburb" || !market.county) return null

  const sourceSlug = routeSlug(market.slug)
  const countySlug = routeSlug(market.county)
  const areaSlug = routeSlug(market.areaSlug || market.slug)
  if (!sourceSlug || !countySlug || !areaSlug) return null

  return {
    sourceSlug,
    countySlug,
    areaSlug,
    destination: `/sold-prices/${countySlug}/${areaSlug}`,
  }
}

function buildShortTownRouteIndex() {
  const routesBySourceSlug = new Map<string, CanonicalAreaRoute[]>()

  for (const market of PPR_MARKETS) {
    const route = canonicalAreaRouteForMarket(market)
    if (!route) continue

    const routes = routesBySourceSlug.get(route.sourceSlug) || []
    if (!routes.some((existing) => existing.destination === route.destination)) {
      routes.push(route)
    }
    routesBySourceSlug.set(route.sourceSlug, routes)
  }

  const redirects: Record<string, string> = {}
  const ambiguous: Record<string, string[]> = {}

  for (const [slug, routes] of routesBySourceSlug) {
    if (routes.length === 1) {
      redirects[slug] = routes[0].destination
    } else if (routes.length > 1) {
      ambiguous[slug] = routes.map((route) => route.destination)
    }
  }

  return { redirects, ambiguous }
}

const SHORT_TOWN_ROUTE_INDEX = buildShortTownRouteIndex()

export const SHORT_TOWN_REDIRECTS = SHORT_TOWN_ROUTE_INDEX.redirects
export const AMBIGUOUS_SHORT_TOWN_SLUGS = SHORT_TOWN_ROUTE_INDEX.ambiguous

export function getShortTownRedirect(slug: string) {
  return SHORT_TOWN_REDIRECTS[routeSlug(slug)]
}

export function getCuratedPprAreaSitemapPaths() {
  return Array.from(
    new Set(
      CURATED_PPR_AREA_SITEMAP_SLUGS.map((slug) => getShortTownRedirect(slug)).filter(
        (path): path is string => Boolean(path)
      )
    )
  )
}
