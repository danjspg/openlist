import {
  notablePlanningSitemapShardNames,
  renderSitemapIndexXml,
} from "@/lib/planning-seo"

export const revalidate = 86400

export async function GET() {
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://www.openlist.ie"
  const shardUrls = notablePlanningSitemapShardNames().map(
    (shard) => `${baseUrl}/sitemaps/planning-notable/${shard}`
  )

  return new Response(renderSitemapIndexXml(shardUrls), {
    headers: {
      "content-type": "application/xml; charset=utf-8",
      "cache-control": "public, s-maxage=86400, stale-while-revalidate=604800",
    },
  })
}
