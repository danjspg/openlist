import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const planningSource = await readFile(new URL("../lib/planning.ts", import.meta.url), "utf8")

test("planning search maps display status labels to normalized status keys", () => {
  assert.match(
    planningSource,
    /query = query\.eq\("normalized_status", normalisePlanningStatus\(filters\.status\)\)/
  )
})

test("planning search expands normalized application type labels to source aliases", () => {
  assert.match(planningSource, /planningApplicationTypeValues\(filters\.type\)/)
  assert.match(planningSource, /query = query\.in\("application_type", applicationTypes\)/)
})

test("broad type filters skip expensive historical aggregate recomputation", () => {
  assert.match(
    planningSource,
    /const shouldLoadFilteredOverview = hasFacetFilters && !filters\.q && !filters\.type/
  )
  assert.match(planningSource, /aggregateAvailable: overviewResult !== null && !filters\.type/)
  assert.match(planningSource, /totalCount: filters\.type\s*\? searchResult\.count/)
})
