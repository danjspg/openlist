import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

async function source(path: string) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8")
}

test("planning search results use the compact planning card hierarchy", async () => {
  const [resultCard, resultsView] = await Promise.all([
    source("components/planning/PlanningApplicationResult.tsx"),
    source("components/planning/PlanningResultsView.tsx"),
  ])

  assert.match(resultCard, /application\.location \|\| application\.proposal/)
  assert.match(resultCard, /Current status/)
  assert.match(resultCard, /Latest activity/)
  assert.match(resultCard, /line-clamp-2/)
  assert.match(resultCard, /border border-emerald-700 bg-emerald-700/)
  assert.match(resultCard, /View application/)
  assert.doesNotMatch(resultCard, /Status: \{application\.status\}/)

  assert.match(resultsView, /resultCount === 1 \? "result" : "results"/)
  assert.match(resultsView, /mappedCount/)
  assert.doesNotMatch(resultsView, /applications shown have usable map coordinates/)
})
