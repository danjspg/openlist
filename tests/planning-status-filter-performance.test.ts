import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const planningSource = await readFile(
  new URL("../lib/planning.ts", import.meta.url),
  "utf8"
)

test("status filters avoid expensive historical aggregate recomputation", () => {
  assert.match(
    planningSource,
    /hasFacetFilters && !filters\.q && !filters\.status && !filters\.type/
  )
  assert.match(
    planningSource,
    /aggregateAvailable: overviewResult !== null && !filters\.status && !filters\.type/
  )
  assert.match(
    planningSource,
    /totalCount: filters\.status \|\| filters\.type\s*\? searchResult\.count/
  )
})
