import { getPlanningLocalitySitemap } from "@/lib/locality-seo"
import { renderSitemapXml } from "@/lib/planning-seo"

export const revalidate = 86400

export async function GET() {
  const baseUrl = (process.env.NEXT_PUBLIC_SITE_URL || "https://www.openlist.ie").replace(/\/+$/, "")
  const rows = await getPlanningLocalitySitemap("expanded")
  return new Response(renderSitemapXml(rows.map((row) => ({
    applicationId: row.canonical_path,
    url: `${baseUrl}${row.canonical_path}`,
    ...(row.last_modified ? { lastModified: new Date(row.last_modified) } : {}),
  }))), { headers: { "content-type": "application/xml; charset=utf-8", "cache-control": "public, s-maxage=86400, stale-while-revalidate=604800" } })
}
