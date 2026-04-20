import type { MetadataRoute } from "next"
import { PPR_MARKETS } from "@/lib/ppr-markets"

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://www.openlist.ie"
  const now = new Date()

  const staticRoutes = [
    "",
    "/about",
    "/listings",
    "/sell",
    "/sold-prices",
    "/sold-prices/search",
  ].map((path) => ({
    url: `${baseUrl}${path}`,
    lastModified: now,
  }))

  const marketRoutes = PPR_MARKETS.map((market) => ({
    url: `${baseUrl}/sold-prices/${market.slug}`,
    lastModified: now,
  }))

  return [...staticRoutes, ...marketRoutes]
}
