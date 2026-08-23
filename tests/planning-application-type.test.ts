import assert from "node:assert/strict"
import test from "node:test"
import {
  planningApplicationTypeLabel,
  planningApplicationTypeValues,
} from "../lib/planning-application-type"

test("planning application type groups collapse source variants", () => {
  assert.deepEqual(
    new Set(planningApplicationTypeValues("Permission")),
    new Set([
      "PERMISSION",
      "Permission",
      "TEMPORARY PERMISSION",
      "Permission (Maritime)",
      "APPROVAL",
      "REDIII Permisssion",
    ])
  )

  assert.ok(
    planningApplicationTypeValues("Outline permission").includes("Outline Permisson")
  )
  assert.ok(
    planningApplicationTypeValues("Retention").includes("Permission for Retention (SDZ)")
  )
  assert.ok(
    !planningApplicationTypeValues("Strategic / large-scale development").includes(
      "Permission for Retention (SDZ)"
    )
  )
})

test("planning application types display canonical labels", () => {
  assert.equal(planningApplicationTypeLabel("OUTLINE PERMISSION"), "Outline permission")
  assert.equal(planningApplicationTypeLabel("Permission and Retention"), "Permission & retention")
  assert.equal(planningApplicationTypeLabel("Unmapped future type"), "Unmapped future type")
})
