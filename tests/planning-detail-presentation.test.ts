import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

test("planning detail summary keeps decision outcome distinct and preserves decision due", async () => {
  const page = await readFile(
    new URL("../app/planning/[authority]/[reference]/page.tsx", import.meta.url),
    "utf8"
  )

  assert.match(page, /const decision = meaningfulPlanningValue\(application\.decision_text\)/)
  assert.match(page, /\{decision \? \(/)
  assert.match(page, />\s*Decision\s*</)
  assert.match(page, /\{councilStatus \? <Detail label="Council status"/)
  assert.doesNotMatch(page, /Detail label="OpenList status"/)
  assert.match(page, /<DecisionDueRelativeText date=\{decisionDue\.date\} \/>/)
  assert.match(page, /Council record currently gives this as the decision due date\./)
  assert.match(page, /<PlanningAlertActions/)
  assert.match(page, /<PlanningTimeline/)
  assert.doesNotMatch(page, /Email me when a decision is made/)
})

test("planning detail metadata prioritises the application location in search titles", async () => {
  const page = await readFile(
    new URL("../app/planning/[authority]/[reference]/page.tsx", import.meta.url),
    "utf8"
  )

  assert.ok(page.includes("const locationTitle = meaningfulPlanningValue(application.location)"))
  assert.ok(page.includes("title: `${locationTitle ?? heading} | ${application.reference} | OpenList`"))
})
