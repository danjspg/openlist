import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"
import {
  formatPlanningCount,
  latestRegistrationMonthLabel,
  localityStatusStats,
} from "../lib/planning-locality-presentation"

test("planning locality dashboard formats counts and names the actual registration month", () => {
  assert.equal(formatPlanningCount(1234), "1,234")
  assert.equal(formatPlanningCount(12847), "12,847")
  assert.equal(latestRegistrationMonthLabel("2026-08"), "Registered in August 2026")
})

test("planning locality dashboard presents normalised user-facing status labels", () => {
  assert.deepEqual(
    localityStatusStats([
      { label: "Decision", count: 3 },
      { label: "decision made", count: 2 },
      { label: "Application under review", count: 4 },
    ]),
    [
      { label: "Decision made", count: 5 },
      { label: "Under assessment", count: 4 },
    ]
  )
})

test("planning locality dashboard reuses concise result presentation and useful local navigation", async () => {
  const read = (path: string) => readFile(new URL(`../${path}`, import.meta.url), "utf8")
  const [page, result] = await Promise.all([
    read("app/planning/[authority]/areas/[areaSlug]/page.tsx"),
    read("components/planning/PlanningApplicationResult.tsx"),
  ])

  assert.match(page, /dashboard\.searchResults\.slice\(0, 6\)/)
  assert.match(page, /<PlanningApplicationList applications=\{latestApplications\}/)
  assert.match(page, /title="Recent decisions"/)
  assert.match(page, /dateLabel="Decision"/)
  assert.match(page, /View all \{formatPlanningCount\(dashboard\.totalCount\)\}/)
  assert.match(page, /Sold prices in \{locality\}/)
  assert.match(page, /alternates: \{ canonical: `\/planning\/\$\{page\.authority\.slug\}\/areas\/\$\{page\.slug\}` \}/)
  assert.match(result, /line-clamp-3/)
  assert.match(result, /dateLabel = "Registered"/)
})
