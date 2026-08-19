import assert from "node:assert/strict"
import test from "node:test"

import {
  filterChangedPlanningRecords,
  normaliseComparable,
  planningRecordChangedFields,
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
  assert.deepEqual(planningRecordChangedFields(existing, incoming), ["proposal"])
})

test("change diagnostics use the same comparison semantics and expose no values", async () => {
  const existing = { local_authority_code: "DUBLINCITY", reference: "26/1", applicant_name: "Private Name", status: "Registered" }
  const incoming = { ...existing, status: "Decision Made" }
  const supabase = {
    from() { return this }, select() { return this }, eq() { return this }, order() { return this },
    range() { return Promise.resolve({ data: [existing], error: null }) },
  }
  const result = await filterChangedPlanningRecords(supabase, [incoming], { authorityCode: "DUBLINCITY" })
  assert.deepEqual(result.changeFieldCounts, { status: 1 })
  assert.deepEqual(result.changedSample, [{ reference: "26/1", fields: ["status"] }])
  assert.equal(JSON.stringify(result.changedSample).includes("Private Name"), false)
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

test("all national lifecycle dates participate in meaningful change detection", () => {
  const baseline = {
    local_authority_code: "KILDARE",
    reference: "2660419",
    further_information_requested_date: null,
    further_information_received_date: null,
    withdrawal_date: null,
    decision_due_date: "2026-09-14",
    expiry_date: null,
    appeal_lodged_date: null,
    appeal_decision_date: null,
  }
  for (const [field, value] of [
    ["further_information_requested_date", "2026-02-04"],
    ["further_information_received_date", "2026-02-24"],
    ["withdrawal_date", "2026-03-03"],
    ["decision_due_date", "2026-10-12"],
    ["expiry_date", "2031-04-18"],
    ["appeal_lodged_date", "2026-05-07"],
    ["appeal_decision_date", "2026-06-22"],
  ]) {
    assert.equal(planningRecordsDiffer(baseline, { ...baseline, [field]: value }), true, field)
  }
  assert.equal(planningRecordsDiffer(baseline, { ...baseline }), false)
})

test("Cork search absence preserves an existing detail-only decision due field", async () => {
  const existing = {
    local_authority_code: "CORKCOCO",
    reference: "26/1595",
    decision_due_date: "2026-09-10",
    status: "Further Information Received",
  }
  const incoming = {
    local_authority_code: existing.local_authority_code,
    reference: existing.reference,
    status: existing.status,
  }
  const supabase = {
    from() { return this },
    select() { return this },
    eq() { return this },
    order() { return this },
    range() { return Promise.resolve({ data: [existing], error: null }) },
  }

  assert.equal(
    planningRecordsDiffer(existing, incoming, { preserveUnobservedFields: ["decision_due_date"] }),
    false
  )
  const unchanged = await filterChangedPlanningRecords(supabase, [incoming], {
    authorityCode: "CORKCOCO",
    preserveUnobservedFields: ["decision_due_date"],
  })
  assert.equal(unchanged.changedRecords.length, 0)

  const changed = await filterChangedPlanningRecords(supabase, [{ ...incoming, proposal: "Changed" }], {
    authorityCode: "CORKCOCO",
    preserveUnobservedFields: ["decision_due_date"],
  })
  assert.equal(changed.changedRecords[0].decision_due_date, "2026-09-10")
})
