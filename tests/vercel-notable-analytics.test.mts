import assert from "node:assert/strict"
import test from "node:test"
import { aggregateNotableDimensions, parsePlanningApplicationPath } from "../scripts/report-vercel-analytics.mts"

test("parses Planning application paths into authority and reference", () => {
  const parsed = parsePlanningApplicationPath("/planning/cork/ref-MjYvMTY0NA")
  assert.deepEqual(parsed, { authorityCode: "CORKCOCO", reference: "26/1644" })
  assert.equal(parsePlanningApplicationPath("/planning/cork"), null)
  assert.equal(parsePlanningApplicationPath("/sold-prices/search"), null)
})

test("aggregates notable traffic by overlapping categories and sources", () => {
  const rows = [
    { requestPath: "/a", visitors: 10, pageviews: 15 },
    { requestPath: "/b", visitors: 4, pageviews: 8 },
  ]
  const metadata = new Map([
    ["/a", { displayName: "A", categories: ["retail", "commercial"], sources: ["deterministic"] }],
    ["/b", { displayName: "B", categories: ["retail"], sources: ["press"] }],
  ])
  const result = aggregateNotableDimensions(rows, metadata)
  assert.deepEqual(result.categories.get("retail"), { visitors: 14, pageviews: 23, pages: 2 })
  assert.deepEqual(result.categories.get("commercial"), { visitors: 10, pageviews: 15, pages: 1 })
  assert.deepEqual(result.sources.get("press"), { visitors: 4, pageviews: 8, pages: 1 })
})
