import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const source = await readFile(new URL("../components/planning/PlanningApplicationResult.tsx", import.meta.url), "utf8")

test("Planning result detail links do not speculatively prefetch database-backed pages", () => {
  const detailLinks = source.match(/<Link[^>]*application\.detailHref[^>]*>/g) ?? []
  assert.equal(detailLinks.length, 2)
  for (const link of detailLinks) assert.match(link, /prefetch=\{false\}/)
})
