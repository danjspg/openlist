import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

async function source(path: string) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8")
}

test("PPR public caches reject transient empty publication windows", async () => {
  const ppr = await source("lib/ppr.ts")

  assert.match(ppr, /PPR_DATASET_CACHE_VERSION = "v4"/)
  assert.match(ppr, /PPR_QUICK_AREAS_CACHE_VERSION = "v2"/)
  assert.match(
    ppr,
    /\["ppr-quick-areas", PPR_DATASET_CACHE_VERSION, PPR_QUICK_AREAS_CACHE_VERSION\]/
  )
  assert.match(ppr, /if \(error \|\| !data\?\.length\)[\s\S]*?PPR quick areas unavailable/)
  assert.match(ppr, /if \(error \|\| !snapshot\).*PPR dataset snapshot unavailable/)
  assert.match(ppr, /!Number\.isFinite\(salesCount\) \|\| salesCount <= 0/)
  assert.doesNotMatch(ppr, /salesCount: Number\(snapshot\?\.sales_count \?\? 0\)/)
})
