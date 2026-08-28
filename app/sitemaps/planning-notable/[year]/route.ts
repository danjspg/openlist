import { getNotablePlanningSitemapApplicationsByYear } from "@/lib/planning"
import {
  buildPlanningSitemapEntries,
  NOTABLE_PLANNING_SITEMAP_SHARD_LIMIT,
  NOTABLE_PLANNING_SITEMAP_START_YEAR,
  renderSitemapXml,
} from "@/lib/planning-seo"

export const revalidate = 86400

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ year: string }> }
) {
  const { year: yearValue } = await params
  const currentYear = new Date().getUTCFullYear()
  let year: number | null = null
  if (yearValue !== "undated") {
    const parsedYear = Number(yearValue)
    if (!Number.isInteger(parsedYear) || parsedYear < NOTABLE_PLANNING_SITEMAP_START_YEAR || parsedYear > currentYear) {
      return new Response("Not found", { status: 404 })
    }
    year = parsedYear
  }

  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://www.openlist.ie"
  const applications = await getNotablePlanningSitemapApplicationsByYear(
    year,
    NOTABLE_PLANNING_SITEMAP_SHARD_LIMIT
  )
  const entries = buildPlanningSitemapEntries(applications, baseUrl)

  return new Response(renderSitemapXml(entries), {
    headers: {
      "content-type": "application/xml; charset=utf-8",
      "cache-control": "public, s-maxage=86400, stale-while-revalidate=604800",
    },
  })
}
