import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

test("historical notable applications are excluded by default and shareable by query parameter", async () => {
  const categories = await readFile(new URL("../lib/planning-public-categories.ts", import.meta.url), "utf8")
  const categoryPage = await readFile(new URL("../app/planning/categories/[category]/page.tsx", import.meta.url), "utf8")
  const localityPage = await readFile(new URL("../app/planning/[authority]/areas/[areaSlug]/page.tsx", import.meta.url), "utf8")
  assert.match(categories, /if \(!includeOlder\) query = query\.eq\("priority_eligible", true\)/)
  assert.match(categoryPage, /includeOlder === "1"/)
  assert.match(categoryPage, /role="switch"/)
  assert.match(categoryPage, /aria-checked=\{includeOlder\}/)
  assert.match(localityPage, /includeOlder=1/)
  const localityData = await readFile(new URL("../lib/planning-locality-notable.ts", import.meta.url), "utf8")
  assert.match(localityData, /p_include_older: includeOlder/)
})
