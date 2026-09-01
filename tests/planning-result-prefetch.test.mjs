import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

// Keep this regression on main so production deploy retries preserve the prefetch guard.
const [source, wrapper] = await Promise.all([
  readFile(new URL("../components/planning/PlanningApplicationResult.tsx", import.meta.url), "utf8"),
  readFile(new URL("../components/RuntimeDataLink.tsx", import.meta.url), "utf8"),
])

test("Planning result detail links do not speculatively prefetch database-backed pages", () => {
  const detailLinks = source.match(/<Link[^>]*application\.detailHref[^>]*>/g) ?? []
  assert.equal(detailLinks.length, 2)
  assert.match(source, /@\/components\/RuntimeDataLink/)
  assert.match(wrapper, /<NextLink \{\.\.\.props\} prefetch=\{false\}/)
})
