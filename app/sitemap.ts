import type { MetadataRoute } from "next"
import { PPR_MARKETS } from "@/lib/ppr-markets"
import { getCuratedPprAreaSitemapPaths } from "@/lib/ppr-sold-price-routes"

export const revalidate = 86400

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://www.openlist.ie"
  const now = new Date()

  const staticRoutes = [
    "",
    "/about",
    "/planning",
    "/terms",
    "/viewings",
    "/sold-prices",
    "/sold-prices/tracked-markets",
    "/sold-prices/counties-compared",
    "/sold-prices/dublin-compared",
    "/sold-prices/cork-compared",
    "/sold-prices/limerick-compared",
    "/sold-prices/galway-compared",
    "/sold-prices/waterford-compared",
    "/sold-prices/commuter-towns",
    "/sold-prices/affordable-markets",
    "/sold-prices/high-value-markets",
    "/sold-prices/most-active-markets",
    "/sold-prices/least-active-markets",
    "/sold-prices/hottest-markets",
    "/sold-prices/coolest-markets",
    "/sold-prices/rising-markets",
    "/sold-prices/falling-markets",
  ].map((path) => ({
    url: `${baseUrl}${path}`,
    lastModified: now,
  }))

  const marketRoutes = PPR_MARKETS.filter(
    (market) => market.marketType !== "town_suburb"
  ).map((market) => ({
    url: `${baseUrl}/sold-prices/${market.slug}`,
    lastModified: now,
  }))

  const canonicalTownRoutes = getCuratedPprAreaSitemapPaths().map((path) => ({
    url: `${baseUrl}${path}`,
    lastModified: now,
  }))

  return [...staticRoutes, ...marketRoutes, ...canonicalTownRoutes]
}
