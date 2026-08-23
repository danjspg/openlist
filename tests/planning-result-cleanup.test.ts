import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"
import {
  planningResultApplicationType,
  planningResultDecision,
  planningResultLocation,
} from "@/lib/planning-result-presentation"

async function source(path: string) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8")
}

test("planning search result locations remove stray spaces before punctuation", () => {
  assert.equal(
    planningResultLocation("Killywilly , Ballyconnell , Co. Cavan"),
    "Killywilly, Ballyconnell, Co. Cavan"
  )
})

test("planning search result application types use readable case", () => {
  assert.equal(planningResultApplicationType("PERMISSION"), "Permission")
  assert.equal(planningResultApplicationType("OUTLINE PERMISSION"), "Outline Permission")
  assert.equal(planningResultApplicationType("LRD"), "LRD")
})

test("planning search result decisions suppress empty N/A metadata", () => {
  assert.equal(planningResultDecision("N/A"), null)
  assert.equal(planningResultDecision("Not recorded"), null)
  assert.equal(planningResultDecision("Granted"), "Granted")
})

test("planning search result summary handles a single result grammatically", async () => {
  const page = await source("app/planning/applications/PlanningApplicationsPage.tsx")

  assert.match(page, /dashboard\.searchCount === 1/)
  assert.match(page, /1 application matches the selected filters\./)
  assert.doesNotMatch(page, /planning applications match the selected filters/)
})
