import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

async function source(path: string) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8")
}

test("sold-price area summaries fall back to visible register evidence", async () => {
  const page = await source("app/sold-prices/[county]/[areaSlug]/page.tsx")

  assert.match(page, /Math\.max\(insights\.totalSalesCount, recentSales\.length\)/)
  assert.match(page, /Recorded sales/)
  assert.match(page, /countUsesRecentFallback/)
  assert.match(page, /medianRecentSalePrice\(recentSales\)/)
  assert.match(page, /summaryLastSaleDate/)
  assert.doesNotMatch(page, /: `Across \$\{analyticsRange\.label\}`}\n\s*<\/p>\n\s*<p[^>]*>\n\s*\{insights\.activity[\s\S]{0,180}: `Across \$\{analyticsRange\.label\}`}/)
})

test("the admin entry point is protected but not advertised sitewide", async () => {
  const [layout, adminPage, robots] = await Promise.all([
    source("app/layout.tsx"),
    source("app/admin/access/page.tsx"),
    source("app/robots.ts"),
  ])

  assert.doesNotMatch(layout, /href="\/admin\/access"/)
  assert.match(adminPage, /index:\s*false/)
  assert.match(adminPage, /follow:\s*false/)
  assert.match(robots, /"\/admin\/"/)
})

test("key repositioned pages publish a truthful sitemap refresh date", async () => {
  const sitemap = await source("app/sitemap.ts")

  assert.match(sitemap, /POSITIONING_REFRESH_DATE/)
  assert.match(sitemap, /2026-08-23T00:00:00Z/)
  assert.match(sitemap, /POSITIONING_REFRESH_ROUTES/)
  assert.match(sitemap, /lastModified: POSITIONING_REFRESH_DATE/)
})
