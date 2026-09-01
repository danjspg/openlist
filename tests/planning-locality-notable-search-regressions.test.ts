import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"
import type { PlanningApplication } from "../lib/planning"
import { groupPlanningLocalityNotables } from "../lib/planning-locality-notable"

function notable(id: string, normalized_status: PlanningApplication["normalized_status"]) {
  return {
    application: {
      id,
      normalized_status,
      registration_date: `2026-08-0${id}`,
      reference: id,
      proposal: "Large development",
    } as PlanningApplication,
    displayName: null,
    categories: ["residential-large"],
  }
}

test("active-only notable filtering happens before the three-card cap", () => {
  const rows = [
    notable("1", "finalised"),
    notable("2", "registered"),
    notable("3", "registered"),
    notable("4", "registered"),
  ]
  const groups = groupPlanningLocalityNotables(rows, 6, 3, true)
  assert.deepEqual(groups[0]?.applications.map((row) => row.application.id), ["2", "3", "4"])
})

test("locality notable UI exposes Active only and semantic status treatment", async () => {
  const page = await readFile(new URL("../app/planning/[authority]/areas/[areaSlug]/page.tsx", import.meta.url), "utf8")
  assert.match(page, /Active only/)
  assert.match(page, /activeOnly: !activeOnly/)
  assert.match(page, /planningSemanticState/)
  assert.match(page, /planningStateBadgeClasses/)
})

test("predictive planning locality search filters against dashboard routability", async () => {
  const route = await readFile(new URL("../app/api/search/suggestions/route.ts", import.meta.url), "utf8")
  const localitySeo = await readFile(new URL("../lib/locality-seo.ts", import.meta.url), "utf8")
  assert.match(route, /getPlanningRoutableLocalitySlugs/)
  assert.match(route, /routableByAuthority/)
  assert.match(route, /has\(entry\.locality_slug\)/)
  assert.match(localitySeo, /openlist_planning_dashboard_snapshot/)
  assert.match(localitySeo, /areaOptions/)
})
