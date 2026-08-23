import assert from "node:assert/strict"
import test from "node:test"
import {
  normalisePlanningStatus,
  planningStatusLabel,
  STATUS_LABELS,
} from "../lib/planning-status.mjs"

test("canonical planning status labels map back to their normalized keys", () => {
  for (const [status, label] of Object.entries(STATUS_LABELS)) {
    assert.equal(normalisePlanningStatus(label), status)
    assert.equal(planningStatusLabel(status), label)
  }
})

test("canonical display labels that were previously ambiguous filter correctly", () => {
  assert.equal(normalisePlanningStatus("Under assessment"), "under_assessment")
  assert.equal(normalisePlanningStatus("Under appeal"), "appealed")
  assert.equal(normalisePlanningStatus("Invalid or incomplete"), "invalid")
  assert.equal(normalisePlanningStatus("Status not classified"), "unknown")
})
