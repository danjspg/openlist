import assert from "node:assert/strict"
import test from "node:test"

import {
  normaliseComparable,
  planningRecordsDiffer,
} from "../lib/planning-ingestion-diff.mjs"

test("planning ingestion ignores volatile timestamps and JSON object key order", () => {
  const existing = {
    local_authority: "Kildare County Council",
    local_authority_code: "KILDARE",
    reference: "2660419",
    area_ids: [2, 1],
    proposal: "Build an extension",
    updated_at: "2026-08-05T12:00:00Z",
  }
  const incoming = {
    ...existing,
    area_ids: [1, 2],
    updated_at: "2026-08-12T12:00:00Z",
  }

  assert.equal(planningRecordsDiffer(existing, incoming), false)
  assert.deepEqual(normaliseComparable({ b: 2, a: 1 }), { a: 1, b: 2 })
})

test("planning ingestion writes a record when a displayed field changes", () => {
  const existing = {
    local_authority: "Kildare County Council",
    local_authority_code: "KILDARE",
    reference: "2660419",
    proposal: "Build an extension",
  }
  const incoming = {
    ...existing,
    proposal: "Build and retain an extension",
  }

  assert.equal(planningRecordsDiffer(existing, incoming), true)
})

test("planning ingestion retains changed raw status wording within one canonical group", () => {
  const existing = {
    local_authority: "Kildare County Council",
    local_authority_code: "KILDARE",
    reference: "2660419",
    status: "Decision Notice Issued",
    decision_text: "Grant Permission",
  }
  const incoming = {
    ...existing,
    status: "Decision Made",
    decision_text: "  grant   permission ",
  }

  assert.equal(planningRecordsDiffer(existing, incoming), true)
})

test("planning ingestion writes genuinely different canonical statuses", () => {
  const existing = {
    local_authority: "Kildare County Council",
    local_authority_code: "KILDARE",
    reference: "2660419",
    status: "New Application",
  }
  const incoming = { ...existing, status: "Decision Made" }

  assert.equal(planningRecordsDiffer(existing, incoming), true)
})

test("a full authoritative proposal is not replaced by its shortened search prefix", () => {
  const short = "Permission for alterations and extensions to the existing dwelling. The proposed"
  const existing = {
    local_authority_code: "CORKCOCO",
    reference: "26/1595",
    proposal: `${short} works include a rear extension and associated site works.`,
  }
  assert.equal(planningRecordsDiffer(existing, { ...existing, proposal: short }), false)
})
