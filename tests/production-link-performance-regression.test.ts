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

test("planning category index is bounded well below the former 50000-row request", async () => {
  const categories = await source("lib/planning-public-categories.ts")

  assert.match(categories, /PUBLIC_CATEGORY_INDEX_LIMIT = 5_000/)
  assert.match(categories, /p_limit: PUBLIC_CATEGORY_INDEX_LIMIT/)
  assert.doesNotMatch(categories, /p_limit: 50000/)
})

test("homepage and category directory do not load the category index on cold render", async () => {
  const homepage = await source("app/page.tsx")
  const directory = await source("app/planning/categories/page.tsx")
  const categories = await source("lib/planning-public-categories.ts")

  assert.doesNotMatch(directory, /getPlanningPublicCategorySummaries/)
  assert.match(directory, /PLANNING_PUBLIC_CATEGORIES\.map/)
  assert.match(categories, /getPlanningPublicCategorySummaries[\s\S]*?return \[\]/)
  assert.match(homepage, /getPlanningPublicCategorySummaries\(\)\.catch\(\(\)=>\[\]\)/)
})

test("national area searches do not request a filtered planning aggregate", async () => {
  const planning = await source("lib/planning.ts")

  assert.match(
    planning,
    /const shouldLoadFilteredOverview =\s*Boolean\(authorityCode \|\| selectedCouncilCode\)[\s\S]*?hasFacetFilters/
  )
  assert.match(planning, /totalCount: hasApplicationFilters \? searchResult\.count : overview\.totalCount/)
})
