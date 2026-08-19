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
})
