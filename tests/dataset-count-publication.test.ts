import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

async function source(path: string) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8")
}

test("planning and sold-price count caches share dataset invalidation tags", async () => {
  const [tags, homepage, planning, ppr, analytics, unifiedSearch] = await Promise.all([
    source("lib/dataset-cache.ts"),
    source("lib/homepage-data.ts"),
    source("lib/planning.ts"),
    source("lib/ppr.ts"),
    source("lib/ppr-analytics.ts"),
    source("lib/unified-search.ts"),
  ])

  assert.match(tags, /PLANNING_DATASET_CACHE_TAG = "planning-dataset"/)
  assert.match(tags, /PPR_DATASET_CACHE_TAG = "ppr-dataset"/)
  assert.match(homepage, /tags: \[PLANNING_DATASET_CACHE_TAG\]/)
  assert.match(planning, /planning-council-activity-12m[\s\S]*?tags: \[PLANNING_DATASET_CACHE_TAG\]/)
  assert.match(planning, /planning-aggregate-summary[\s\S]*?tags: \[PLANNING_DATASET_CACHE_TAG\]/)
  assert.match(ppr, /ppr-dataset-summary[\s\S]*?tags: \[PPR_DATASET_CACHE_TAG\]/)
  assert.match(analytics, /ppr-homepage-sold-price-stats[\s\S]*?tags: \[PPR_DATASET_CACHE_TAG\]/)
  assert.match(unifiedSearch, /tags: \[PLANNING_DATASET_CACHE_TAG, PPR_DATASET_CACHE_TAG\]/)
})

test("dataset invalidation is authenticated and covers shared entry pages", async () => {
  const [route, caller] = await Promise.all([
    source("app/api/internal/dataset-cache-revalidate/route.ts"),
    source("scripts/revalidate-dataset-caches.mjs"),
  ])

  assert.match(route, /process\.env\.PLANNING_REVALIDATION_SECRET/)
  assert.match(route, /revalidateTag\(tag\)/)
  assert.match(route, /revalidatePath\("\/", "page"\)/)
  assert.match(route, /revalidatePath\("\/search", "page"\)/)
  assert.match(route, /"\/planning" : "\/sold-prices"/)
  assert.match(caller, /method: "POST"/)
  assert.match(caller, /authorization: `Bearer \$\{secret\}`/)
})

test("snapshot verification compares exact source counts and newest dates", async () => {
  const verifier = await source("scripts/verify-dataset-snapshots.mjs")

  assert.match(verifier, /count: "exact", head: true/)
  assert.match(verifier, /order\(dateColumn, \{ ascending: false \}\)/)
  assert.match(verifier, /snapshotCount !== actual\.count/)
  assert.match(verifier, /snapshotLatestDate !== actual\.latestDate/)
  assert.match(verifier, /authorityCode !== "NATIONAL"/)
  assert.match(verifier, /exactCountAndLatest\("ppr_sales", "date_of_sale"\)/)
})

test("ingestion workflows publish and invalidate verified snapshots even after failures", async () => {
  const [activePlanning, weeklyPlanning, ppr] = await Promise.all([
    source(".github/workflows/planning-active-refresh.yml"),
    source(".github/workflows/planning-refresh.yml"),
    source(".github/workflows/ppr-refresh.yml"),
  ])

  for (const workflow of [activePlanning, weeklyPlanning]) {
    assert.match(workflow, /publish-snapshots:[\s\S]*?if: \$\{\{ always\(\) \}\}/)
    assert.match(workflow, /refresh-planning-dashboard-snapshots\.mjs/)
    assert.match(workflow, /verify-dataset-snapshots\.mjs planning/)
    assert.match(workflow, /revalidate-dataset-caches\.mjs planning/)
  }

  assert.match(ppr, /PPR_DEFER_DERIVED_REFRESH: "1"/)
  assert.match(ppr, /publish-snapshots:[\s\S]*?if: \$\{\{ always\(\) \}\}/)
  assert.match(ppr, /rebuild-ppr-phase1-analytics\.mjs/)
  assert.match(ppr, /verify-dataset-snapshots\.mjs ppr/)
  assert.match(ppr, /revalidate-dataset-caches\.mjs ppr/)
})

test("the all-time sold-price snapshot uses the true newest sale date", async () => {
  const rebuild = await source("scripts/rebuild-ppr-phase1-analytics.mjs")

  assert.match(rebuild, /const latestSaleDate = allSales\.reduce/)
  assert.match(rebuild, /latest_sale_date: latestSaleDate/)
  assert.doesNotMatch(rebuild, /latest_sale_date: allSales\[0\]/)
})
