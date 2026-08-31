import type { MetadataRoute } from "next"
import { PLANNING_AUTHORITIES } from "@/lib/planning-authorities"
import { PPR_MARKETS } from "@/lib/ppr-markets"
import rawSnapshots from "@/data/sitemap-snapshots.json"
import { parseSitemapSnapshotSet, sitemapMetadataEntries } from "@/lib/sitemap-snapshot"

export const dynamic = "force-dynamic"

const snapshots = parseSitemapSnapshotSet(rawSnapshots)

const POSITIONING_REFRESH_DATE = new Date("2026-08-23T00:00:00Z")
const POSITIONING_REFRESH_ROUTES = new Set([
  "",
  "/about",
  "/planning",
  "/search",
  "/sold-prices",
])

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://www.openlist.ie"
  const staticRoutes = [
    "",
    "/about",
    "/planning",
    "/planning/areas",
    "/planning/categories",
    "/search",
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
    ...(POSITIONING_REFRESH_ROUTES.has(path)
      ? { lastModified: POSITIONING_REFRESH_DATE }
      : {}),
  }))

  const marketRoutes = PPR_MARKETS.filter(
    (market) => market.marketType !== "town_suburb"
  ).map((market) => ({
    url: `${baseUrl}/sold-prices/${market.slug}`,
  }))

  const planningAuthorityRoutes = PLANNING_AUTHORITIES.flatMap((authority) => [
    { url: `${baseUrl}/planning/${authority.slug}` },
    { url: `${baseUrl}/planning/${authority.slug}/areas` },
  ])

  const entries = [
    ...staticRoutes,
    ...planningAuthorityRoutes,
    ...sitemapMetadataEntries(snapshots.sitemaps.root, baseUrl),
    ...marketRoutes,
  ]
  return [...new Map(entries.map((entry) => [entry.url, entry])).values()]
}
