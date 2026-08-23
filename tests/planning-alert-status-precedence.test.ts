import assert from "node:assert/strict"
import test from "node:test"

import { applicationUpdates } from "../lib/planning-alert-watch.mjs"

test("ePlan alert observations attach status provenance even when the value already matches", () => {
  const observedAt = "2026-08-23T16:00:00.000Z"
  const updates = applicationUpdates(
    { status: "Decision Made" },
    { status: "Decision Made" },
    ["status"],
    { strategy: "eplan", observedAt }
  )

  assert.deepEqual(updates, {
    status_source: "eplan",
    status_observed_at: observedAt,
  })
})

test("ePlan status changes carry provenance with the canonical value", () => {
  const observedAt = "2026-08-23T16:05:00.000Z"
  const updates = applicationUpdates(
    { status: "Under Assessment" },
    { status: "Decision Made" },
    ["status"],
    { strategy: "eplan", observedAt }
  )

  assert.deepEqual(updates, {
    status: "Decision Made",
    status_source: "eplan",
    status_observed_at: observedAt,
  })
})

test("non-ePlan alert sources do not claim protected status provenance", () => {
  const updates = applicationUpdates(
    { status: "Under Assessment" },
    { status: "Decision Made" },
    ["status"],
    { strategy: "national_arcgis_exact", observedAt: "2026-08-23T16:10:00.000Z" }
  )

  assert.deepEqual(updates, { status: "Decision Made" })
})
