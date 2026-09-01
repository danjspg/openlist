import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

async function source(path: string) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8")
}

test("observed legacy public URLs redirect to canonical routes", async () => {
  const config = await source("next.config.ts")

  assert.match(config, /source: "\/planning\/categories\/residential"[\s\S]*?destination: "\/planning\/categories\/residential-development"/)
  assert.match(config, /source: "\/sold-prices\/ballinrobe"[\s\S]*?destination: "\/sold-prices\/mayo\/ballinrobe"/)
  assert.match(config, /source: "\/sold-prices\/bailieborough"[\s\S]*?destination: "\/sold-prices\/cavan\/bailieborough"/)
})

test("sold-price locality pages avoid optional planning and other-market DB fan-out", async () => {
  const page = await source("app/sold-prices/[county]/[areaSlug]/page.tsx")

  assert.doesNotMatch(page, /getNearbyAreaLinks/)
  assert.doesNotMatch(page, /getPlanningApplicationsForSoldPriceArea/)
  assert.doesNotMatch(page, /planningResultRecord/)
  assert.match(page, /await getAreaInsights/)
  assert.match(page, /Planning in \{areaName\}/)
})

test("planning category pages use one bounded exact-membership window", async () => {
  const categories = await source("lib/planning-public-categories.ts")

  assert.match(categories, /PLANNING_PUBLIC_CATEGORY_PAGE_SIZE/)
  assert.match(categories, /p_limit:pageSize/)
  assert.match(categories, /openlist_planning_public_category_page_active/)
  assert.doesNotMatch(categories, /p_limit: 50000/)
})

test("homepage and category directory do not load the category index on cold render", async () => {
  const homepage = await source("app/page.tsx")
  const directory = await source("app/planning/categories/page.tsx")
  const categories = await source("lib/planning-public-categories.ts")

  assert.doesNotMatch(directory, /getPlanningPublicCategorySummaries/)
  assert.match(directory, /PLANNING_PUBLIC_CATEGORIES\.map/)
  assert.match(categories, /getPlanningPublicCategorySummaries[\s\S]*?return\[\]as/)
  assert.match(homepage, /getPlanningPublicCategorySummaries\(\)\.catch\(\(\)=>\[\]\)/)
})

test("national area searches do not request a filtered planning aggregate", async () => {
  const planning = await source("lib/planning.ts")

  assert.match(planning, /hasApplicationFilters\s*\? Promise\.resolve\(null\)\s*:\s*getPlanningAggregateSummaryCached/)
  assert.doesNotMatch(planning, /openlist_planning_dashboard_aggregate/)
  assert.match(planning, /totalCount: hasApplicationFilters \? searchResult\.count : overview\.totalCount/)
})
