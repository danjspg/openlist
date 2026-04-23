import type { MetadataRoute } from "next"
import { PUBLIC_SALE_STATUSES } from "@/lib/listing-status"
import { isExcludedStandaloneAreaSlug } from "@/lib/ppr"
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
    "/sell",
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

  const marketRoutes = PPR_MARKETS.map((market) => ({
    url: `${baseUrl}/sold-prices/${market.slug}`,
    lastModified: now,
  }))

  const [{ data: areaRows }, { data: listingRows }] = await Promise.all([
    supabase
      .from("ppr_area_stats")
      .select("county,area_slug,last_sale_date")
      .not("county", "is", null)
      .not("area_slug", "is", null)
      .limit(100000),
    supabase
      .from("listings")
      .select("slug,created_at,status")
      .in("status", [...PUBLIC_SALE_STATUSES, "Featured"]),
  ])

  const seenAreas = new Set<string>()
  const areaRoutes =
    areaRows?.flatMap((row) => {
      const county = String(row.county || "").trim().toLowerCase()
      const areaSlug = String(row.area_slug || "").trim()

      if (!county || !areaSlug || isExcludedStandaloneAreaSlug(areaSlug)) {
        return []
      }

      const key = `${county}:${areaSlug}`
      if (seenAreas.has(key)) {
        return []
      }
      seenAreas.add(key)

      return {
        url: `${baseUrl}/sold-prices/${encodeURIComponent(county)}/${areaSlug}`,
        lastModified: row.last_sale_date ? new Date(row.last_sale_date) : now,
      }
    }) ?? []

  const listingRoutes =
    listingRows?.map((listing) => ({
      url: `${baseUrl}/listings/${listing.slug}`,
      lastModified: listing.created_at ? new Date(listing.created_at) : now,
    })) ?? []

  return [...staticRoutes, ...marketRoutes, ...areaRoutes, ...listingRoutes]
}
