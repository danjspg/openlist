import assert from "node:assert/strict"
import test from "node:test"
import {
  isPlanningAreaAlertCategory,
  isPlanningAreaAlertRadius,
  isPlanningAreaAlertTrigger,
  notableCategoriesMatchAreaAlert,
  planningAreaAlertRadiusLabel,
} from "../lib/planning-area-alerts"

test("residential area alerts cover both medium and large schemes", () => {
  assert.equal(notableCategoriesMatchAreaAlert("residential-development", ["residential-development"]), true)
  assert.equal(notableCategoriesMatchAreaAlert("residential-development", ["large-residential"]), true)
  assert.equal(notableCategoriesMatchAreaAlert("residential-development", ["wind-farms"]), false)
})

test("significant development alert matches any notable classification", () => {
  assert.equal(notableCategoriesMatchAreaAlert("significant-development", ["wind-farms"]), true)
  assert.equal(notableCategoriesMatchAreaAlert("significant-development", ["retail", "infrastructure"]), true)
  assert.equal(notableCategoriesMatchAreaAlert("significant-development", []), false)
  assert.equal(notableCategoriesMatchAreaAlert("significant-development", null), false)
})

test("significant development categories match exactly", () => {
  assert.equal(notableCategoriesMatchAreaAlert("wind-farms", ["wind-farms", "energy"]), true)
  assert.equal(notableCategoriesMatchAreaAlert("wind-farms", ["solar-energy"]), false)
  assert.equal(notableCategoriesMatchAreaAlert("data-centres", ["data-centres"]), true)
})

test("all-development alerts do not require notable classification", () => {
  assert.equal(notableCategoriesMatchAreaAlert("all", null), true)
  assert.equal(notableCategoriesMatchAreaAlert("all", []), true)
})

test("area alert options reject arbitrary values", () => {
  assert.equal(isPlanningAreaAlertCategory("wind-farms"), true)
  assert.equal(isPlanningAreaAlertCategory("significant-development"), true)
  assert.equal(isPlanningAreaAlertCategory("anything"), false)
  assert.equal(isPlanningAreaAlertTrigger("approved"), true)
  assert.equal(isPlanningAreaAlertTrigger("changed"), false)
  assert.equal(isPlanningAreaAlertRadius(10_000), true)
  assert.equal(isPlanningAreaAlertRadius(12_345), false)
  assert.equal(planningAreaAlertRadiusLabel(500), "500 m")
  assert.equal(planningAreaAlertRadiusLabel(10_000), "10 km")
})
