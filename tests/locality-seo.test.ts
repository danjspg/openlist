import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"
import { localityPath, selectCohort, LOCALITY_COHORT_SIZE } from "../lib/locality-seo-core"

test("locality cohort ranking is deterministic, capped, and deduplicated", () => {
  const selected = selectCohort([{ path: "/b", score: 4 }, { path: "/a", score: 4 }, { path: "/a", score: 9 }], 2)
  assert.deepEqual(selected.map((row) => row.path), ["/a", "/b"])
  assert.equal(LOCALITY_COHORT_SIZE, 100)
})

test("locality canonical paths are authority scoped and stable", () => {
  assert.equal(localityPath("sold_prices", { county: "cork", slug: "carrigaline" }), "/sold-prices/cork/carrigaline")
  assert.equal(localityPath("planning", { authority: "cork", slug: "carrigaline" }), "/planning/cork/areas/carrigaline")
})

test("locality routes, sitemaps, robots and migration preserve permanent pages", async () => {
  const read = (path: string) => readFile(new URL(`../${path}`, import.meta.url), "utf8")
  const [migration, robots, soldSitemap, planningSitemap, page, root] = await Promise.all([
    read("supabase/migrations/20260821233030_add_locality_seo_cohorts.sql"), read("app/robots.ts"), read("app/sitemaps/sold-prices-localities.xml/route.ts"), read("app/sitemaps/planning-localities.xml/route.ts"), read("app/planning/[authority]/areas/[areaSlug]/page.tsx"), read("app/sitemap.ts"),
  ])
  assert.match(migration, /locality_seo_memberships/)
  assert.match(migration, /p_min_residence_days integer default 42/)
  assert.match(migration, /p_max_rotation integer default 20/)
  assert.match(robots, /sold-prices-localities\.xml/)
  assert.match(robots, /planning-localities\.xml/)
  assert.match(soldSitemap, /getLocalitySitemap\("sold_prices"\)/)
  assert.match(planningSitemap, /getLocalitySitemap\("planning"\)/)
  assert.match(page, /\/planning\/\$\{page\.authority\.slug\}\/areas/)
  assert.doesNotMatch(root, /getCuratedPprAreaSitemapPaths/)
})
