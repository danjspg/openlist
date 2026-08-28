import { revalidatePath, revalidateTag } from "next/cache"
import { NextRequest, NextResponse } from "next/server"
import {
  isDatasetCacheTarget,
  PLANNING_DATASET_CACHE_TAG,
  PPR_DATASET_CACHE_TAG,
} from "@/lib/dataset-cache"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function POST(request: NextRequest) {
  const secret = process.env.PLANNING_REVALIDATION_SECRET
  const supplied = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "")
  if (!secret || !supplied || supplied !== secret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const dataset = request.nextUrl.searchParams.get("dataset")
  if (!isDatasetCacheTarget(dataset)) {
    return NextResponse.json({ error: "Invalid dataset" }, { status: 400 })
  }

  const tag =
    dataset === "planning" ? PLANNING_DATASET_CACHE_TAG : PPR_DATASET_CACHE_TAG
  const datasetPath = dataset === "planning" ? "/planning" : "/sold-prices"

  revalidateTag(tag)
  revalidatePath("/", "page")
  revalidatePath("/search", "page")

  // Keep aggregate entry pages immediately fresh without invalidating the
  // entire dataset route tree. Descendant Planning detail pages are refreshed
  // by the durable exact-path queue when their source record changes; other
  // descendants retain their normal tag/TTL freshness. Layout invalidation
  // here would make crawler visits regenerate large numbers of unchanged ISR
  // pages and needlessly increase ISR writes and function CPU.
  revalidatePath(datasetPath, "page")

  return NextResponse.json({
    dataset,
    revalidated: true,
    tag,
    paths: ["/", "/search", datasetPath],
    scope: "entry-pages",
  })
}
