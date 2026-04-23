import {
  BASE_PPR_MARKETS,
  FEATURED_PPR_MARKETS as FEATURED_PPR_MARKET_SLUGS,
  PPR_MARKET_OVERRIDES as PPR_MARKET_OVERRIDES_SOURCE,
  SUPPLEMENTAL_PPR_MARKET_SLUGS,
} from "@/lib/ppr-data.mjs"

export type PprMarketType = "county" | "dublin_district" | "town_suburb"

export type PprMarket = {
  name: string
  slug: string
  marketType: PprMarketType
  county?: string
  areaSlug?: string
  displayName?: string
}

const PPR_MARKET_OVERRIDES = PPR_MARKET_OVERRIDES_SOURCE as Record<string, Partial<PprMarket>>
const BASE_MARKETS = BASE_PPR_MARKETS as readonly PprMarket[]
const SUPPLEMENTAL_MARKET_SLUGS = SUPPLEMENTAL_PPR_MARKET_SLUGS as readonly string[]

function formatSupplementalMarketName(slug: string) {
  return slug
    .split("-")
    .filter(Boolean)
    .map((part, index) => {
      const lower = part.toLowerCase()

      if (lower === "rd") return "Rd"
      if (lower === "st") return "St"
      if (["on", "of"].includes(lower) && index > 0) return lower
      if (lower === "the") return index === 0 ? "The" : "the"
      if (/^\d+$/.test(part)) return part

      return part.charAt(0).toUpperCase() + part.slice(1)
    })
    .join(" ")
}

export const PPR_MARKETS: readonly PprMarket[] = [
  ...BASE_MARKETS.map((market) => ({
    ...market,
    ...PPR_MARKET_OVERRIDES[market.slug],
  })),
  ...SUPPLEMENTAL_MARKET_SLUGS.map((slug) => {
    const override = PPR_MARKET_OVERRIDES[slug]

    return {
      name: formatSupplementalMarketName(slug),
      slug,
      marketType: "town_suburb" as const,
      ...override,
    }
  }),
]

export const FEATURED_PPR_MARKETS = FEATURED_PPR_MARKET_SLUGS as readonly string[]

export function getPprMarket(slug: string) {
  return PPR_MARKETS.find((market) => market.slug === slug)
}

export function pprMarketLabel(market: PprMarket) {
  return market.displayName || market.name
}

export function isCountyPprMarket(market: PprMarket) {
  return market.marketType === "county"
}

export function dublinDistrictPrefix(market: PprMarket) {
  if (market.marketType !== "dublin_district") return ""
  const district = market.name.replace(/^Dublin\s+/i, "").toUpperCase()
  return district === "6W" ? "D6W" : `D${district.padStart(2, "0")}`
}

const COMPARISON_ROUTE_BY_COUNTY: Partial<Record<string, { href: string; label: string }>> = {
  Dublin: { href: "/sold-prices/dublin-compared", label: "Dublin Market" },
  Cork: { href: "/sold-prices/cork-compared", label: "Cork Market" },
  Limerick: { href: "/sold-prices/limerick-compared", label: "Limerick Market" },
  Galway: { href: "/sold-prices/galway-compared", label: "Galway Market" },
  Waterford: { href: "/sold-prices/waterford-compared", label: "Waterford Market" },
}

const COMMUTER_COMPARISON_SLUGS = new Set([
  "drogheda",
  "dundalk",
  "bray",
  "greystones",
  "naas",
  "newbridge",
  "navan",
  "mullingar",
  "portlaoise",
])

export function getRelevantMarketComparisonLinks(market: PprMarket) {
  const links: Array<{ href: string; label: string }> = []
  const seen = new Set<string>()

  function addLink(link?: { href: string; label: string }) {
    if (!link || seen.has(link.href)) return
    seen.add(link.href)
    links.push(link)
  }

  if (market.marketType === "county") {
    addLink(COMPARISON_ROUTE_BY_COUNTY[market.name])
  } else {
    const countyName =
      market.county || (market.marketType === "dublin_district" ? "Dublin" : undefined)
    if (countyName) {
      addLink(COMPARISON_ROUTE_BY_COUNTY[countyName])
    }
  }

  if (COMMUTER_COMPARISON_SLUGS.has(market.slug)) {
    addLink({ href: "/sold-prices/commuter-towns", label: "Dublin Commuter Towns" })
  }

  addLink({ href: "/sold-prices/rising-markets", label: "Rising Markets" })
  addLink({ href: "/sold-prices/affordable-markets", label: "Affordable Markets" })

  return links
}
