import { getNotablePlanningSitemapApplications } from "@/lib/planning"
import {
  buildPlanningSitemapEntries,
  NOTABLE_PLANNING_SITEMAP_LIMIT,
  renderSitemapXml,
} from "@/lib/planning-seo"

export const revalidate = 86400

export async function GET() {
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://www.openlist.ie"
  const applications = await getNotablePlanningSitemapApplications(
    NOTABLE_PLANNING_SITEMAP_LIMIT
  )
  const entries = buildPlanningSitemapEntries(applications, baseUrl)

  return new Response(renderSitemapXml(entries), {
    headers: {
      "content-type": "application/xml; charset=utf-8",
      "cache-control": "public, s-maxage=86400, stale-while-revalidate=604800",
    },
  })
}
