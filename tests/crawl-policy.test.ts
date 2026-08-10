import assert from "node:assert/strict"
import test from "node:test"
import { readFile } from "node:fs/promises"
import { getUtilityCrawlPolicy } from "../lib/crawl-policy"
import { buildPlanningFilterFields } from "../lib/planning-filters"

test("canonical planning and search routes remain indexable", () => {
  assert.equal(getUtilityCrawlPolicy("/planning", new URLSearchParams()), null)
  assert.equal(
    getUtilityCrawlPolicy("/planning/cork-county", new URLSearchParams()),
    null
  )
  assert.equal(
    getUtilityCrawlPolicy(
      "/planning/cork-county/2461234",
      new URLSearchParams()
    ),
    null
  )
  assert.equal(getUtilityCrawlPolicy("/search", new URLSearchParams()), null)
})

test("planning filter and unified-search query states are noindex with base canonicals", () => {
  assert.deepEqual(
    getUtilityCrawlPolicy(
      "/planning/cork-county",
      new URLSearchParams("area=Carrigaline&status=Granted")
    ),
    {
      canonicalPath: "/planning/cork-county",
      robots: "noindex, follow",
    }
  )
  assert.deepEqual(
    getUtilityCrawlPolicy("/search", new URLSearchParams("q=Carrigaline")),
    { canonicalPath: "/search", robots: "noindex, follow" }
  )
})

test("planning filter forms preserve human filter state without constructing hrefs", async () => {
  assert.deepEqual(
    buildPlanningFilterFields(
      {
        q: "housing",
        area: "Carrigaline",
        council: "",
        status: "Granted",
        type: "",
      },
      "type",
      "Permission"
    ),
    {
      q: "housing",
      area: "Carrigaline",
      status: "Granted",
      type: "Permission",
    }
  )

  const planningPage = await readFile(
    new URL(
      "../app/planning/applications/PlanningApplicationsPage.tsx",
      import.meta.url
    ),
    "utf8"
  )
  assert.doesNotMatch(planningPage, /planningFilterHref/)
  assert.match(planningPage, /<form action=\{action\} method="get"/)
})

test("filtered planning renders through a noindex utility route with a base canonical", async () => {
  const [utilityPage, middleware] = await Promise.all([
    readFile(
      new URL("../app/planning/applications/page.tsx", import.meta.url),
      "utf8"
    ),
    readFile(new URL("../middleware.ts", import.meta.url), "utf8"),
  ])

  assert.match(utilityPage, /canonical: authority \? `\/planning\/\$\{authority\.slug\}` : "\/planning"/)
  assert.match(utilityPage, /index: false/)
  assert.match(middleware, /NextResponse\.rewrite\(rewriteUrl\)/)
  assert.match(middleware, /x-robots-tag/)
})
