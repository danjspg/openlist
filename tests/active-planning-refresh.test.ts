import assert from "node:assert/strict"
import test from "node:test"

import {
  buildActivePlanningRefreshRanges,
  subtractUtcDays,
  type ActivePlanningRefreshCandidate,
} from "../lib/active-planning-refresh"

test("subtractUtcDays uses UTC calendar days", () => {
  assert.equal(subtractUtcDays("2026-08-20", 90), "2026-05-22")
  assert.equal(subtractUtcDays("2026-03-01", 1), "2026-02-28")
})

test("buildActivePlanningRefreshRanges merges contiguous active months per authority", () => {
  const candidates: ActivePlanningRefreshCandidate[] = [
    { id: "1", local_authority_code: "CORKCOCO", registration_date: "2026-01-15", normalized_status: "registered" },
    { id: "2", local_authority_code: "CORKCOCO", registration_date: "2026-01-20", normalized_status: "under_assessment" },
    { id: "3", local_authority_code: "CORKCOCO", registration_date: "2026-02-04", normalized_status: "further_information_requested" },
    { id: "4", local_authority_code: "CORKCOCO", registration_date: "2026-04-09", normalized_status: "appealed" },
    { id: "5", local_authority_code: "GALWAYCOCO", registration_date: "2026-08-11", normalized_status: "registered" },
  ]

  assert.deepEqual(buildActivePlanningRefreshRanges(candidates, "2026-08-20"), [
    {
      localAuthorityCode: "GALWAYCOCO",
      from: "2026-08-01",
      to: "2026-08-20",
      candidateCount: 1,
      monthCount: 1,
    },
    {
      localAuthorityCode: "CORKCOCO",
      from: "2026-04-01",
      to: "2026-04-30",
      candidateCount: 1,
      monthCount: 1,
    },
    {
      localAuthorityCode: "CORKCOCO",
      from: "2026-01-01",
      to: "2026-02-28",
      candidateCount: 3,
      monthCount: 2,
    },
  ])
})

test("future-dated candidates are ignored", () => {
  const candidates: ActivePlanningRefreshCandidate[] = [
    { id: "1", local_authority_code: "MEATH", registration_date: "2026-09-01", normalized_status: "registered" },
  ]
  assert.deepEqual(buildActivePlanningRefreshRanges(candidates, "2026-08-20"), [])
})
