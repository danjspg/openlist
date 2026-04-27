import type { MetadataRoute } from "next"
import { LEGACY_SHORT_TOWN_REDIRECTS } from "@/lib/ppr-legacy-town-routes"
import { PPR_MARKETS } from "@/lib/ppr-markets"
import { getServerSupabase } from "@/lib/supabase"

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://www.openlist.ie"
  const now = new Date()
  const supabase = getServerSupabase()

  const staticRoutes = [
    "",
    "/about",
    "/listings",
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

  const canonicalTownRoutes = Object.values(LEGACY_SHORT_TOWN_REDIRECTS).map((path) => ({
    url: `${baseUrl}${path}`,
    lastModified: now,
  }))

  const { data: listingRows } = await supabase
    .from("listings")
    .select("slug,created_at,status")
    .in("status", ["For Sale", "Featured"])

  const listingRoutes =
    listingRows?.map((listing) => ({
      url: `${baseUrl}/listings/${listing.slug}`,
      lastModified: listing.created_at ? new Date(listing.created_at) : now,
    })) ?? []

  return [...staticRoutes, ...marketRoutes, ...canonicalTownRoutes, ...listingRoutes]
}
