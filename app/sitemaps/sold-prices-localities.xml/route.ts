import rawSnapshots from "@/data/sitemap-snapshots.json"
import { parseSitemapSnapshotSet, sitemapSnapshotResponse } from "@/lib/sitemap-snapshot"

export const dynamic = "force-dynamic"

const snapshots = parseSitemapSnapshotSet(rawSnapshots)

export async function GET() {
  return sitemapSnapshotResponse(snapshots.sitemaps.soldPricesLocalities)
}
