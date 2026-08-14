import type { MetadataRoute } from "next"
import { getPlanningSitemapApplications } from "@/lib/planning"
import { PLANNING_AUTHORITIES, getPlanningAuthorityByCode } from "@/lib/planning-authorities"
import { planningApplicationPath } from "@/lib/property-intelligence"
import { PPR_MARKETS } from "@/lib/ppr-markets"
import { getCuratedPprAreaSitemapPaths } from "@/lib/ppr-sold-price-routes"

export const revalidate = 86400
export const PLANNING_APPLICATION_SITEMAP_LIMIT = 5000

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://www.openlist.ie"
  const staticRoutes = [
    "",
    "/about",
    "/planning",
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
  }))

  const marketRoutes = PPR_MARKETS.filter(
    (market) => market.marketType !== "town_suburb"
  ).map((market) => ({
    url: `${baseUrl}/sold-prices/${market.slug}`,
  }))

  const canonicalTownRoutes = getCuratedPprAreaSitemapPaths().map((path) => ({
    url: `${baseUrl}${path}`,
  }))

  const planningAuthorityRoutes = PLANNING_AUTHORITIES.map((authority) => ({
    url: `${baseUrl}/planning/${authority.slug}`,
  }))

  const planningApplications = await getPlanningSitemapApplications(
    PLANNING_APPLICATION_SITEMAP_LIMIT
  )
  const planningApplicationRoutes = planningApplications.flatMap((application) => {
    const authority = getPlanningAuthorityByCode(application.local_authority_code)
    if (!authority) return []
    const sourceModified = application.updated_at || application.registration_date
    return [{
      url: `${baseUrl}${planningApplicationPath(authority, application.reference)}`,
      ...(sourceModified ? { lastModified: new Date(sourceModified) } : {}),
    }]
  })

  return [
    ...staticRoutes,
    ...planningAuthorityRoutes,
    ...planningApplicationRoutes,
    ...marketRoutes,
    ...canonicalTownRoutes,
  ]
}
