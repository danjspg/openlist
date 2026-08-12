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
