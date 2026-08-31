import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

async function source(path: string) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8")
}

test("sold-price locality alternatives do not claim geographic proximity", async () => {
  const areaPage = await source("app/sold-prices/[county]/[areaSlug]/page.tsx")

  assert.doesNotMatch(areaPage, />\s*Nearby areas\s*</)
  assert.match(areaPage, /Other \{countyLabel\} markets/)
  assert.match(areaPage, /other markets in \{countyLabel\}/)
})

test("sold-price entry page publishes one canonical dataset count", async () => {
  const soldPrices = await source("app/sold-prices/page.tsx")

  assert.match(soldPrices, /format\(datasetSummary\.salesCount\)/)
  assert.doesNotMatch(soldPrices, /getNationalOverviewSnapshot\("all"\)/)
  assert.doesNotMatch(soldPrices, /allTimeSnapshot/)
})

test("planning overview separates completed months from the live month", async () => {
  const planningPage = await source("app/planning/applications/PlanningApplicationsPage.tsx")

  assert.match(planningPage, /stats\.filter\(\(stat\) => stat\.label < currentMonth\)\.slice\(-12\)/)
  assert.match(planningPage, /Latest 12 completed registration months\./)
  assert.match(planningPage, /Current registration month:/)
})

test("homepage notable decisions never publish placeholder N\/A as the decision", async () => {
  const homepageData = await source("lib/homepage-data.ts")

  assert.match(homepageData, /PLACEHOLDER_PLANNING_LABELS/)
  assert.match(homepageData, /application\.decision_date \? "Decision recorded" : null/)
  assert.match(homepageData, /v4-normalized-decision-labels/)
})
