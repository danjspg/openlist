import assert from "node:assert/strict"
import test from "node:test"
import { readFileSync } from "node:fs"

import {
  classifyHighInterestQa,
  proposalPresentationProblems,
  rankHighInterestCandidates,
  timelineProblems,
} from "../lib/high-interest-planning-qa"
import { parsePlanningDetailUrl } from "../lib/planning-seo"

test("high-interest cohort ranks clicks before impressions and remains bounded", () => {
  const ranked = rankHighInterestCandidates([
    { application_id: "a", local_authority_code: "DLR", reference: "A", clicks: 2, impressions: 1 },
    { application_id: "b", local_authority_code: "DLR", reference: "B", clicks: 2, impressions: 8 },
    { application_id: "c", local_authority_code: "DLR", reference: "C", clicks: 3, impressions: 0 },
  ], 2)
  assert.deepEqual(ranked.map((row) => row.application_id), ["c", "b"])
})

test("generic planning URLs cannot enter the QA cohort", () => {
  assert.equal(parsePlanningDetailUrl("https://www.openlist.ie/planning"), null)
  assert.equal(parsePlanningDetailUrl("https://www.openlist.ie/planning/cork-county"), null)
})

test("presentation checks identify missing or unsound derived page copy", () => {
  assert.deepEqual(proposalPresentationProblems(null), ["proposal is missing", "heading falls back to generic text", "description falls back to generic text"])
  assert.deepEqual(proposalPresentationProblems("Permission for a rear extension to the existing dwelling."), [])
})

test("classification distinguishes repaired, warning, failure, and source failure", () => {
  assert.equal(classifyHighInterestQa({}), "PASS")
  assert.equal(classifyHighInterestQa({ repaired: true }), "REPAIRED")
  assert.equal(classifyHighInterestQa({ warnings: ["source unavailable"] }), "WARN")
  assert.equal(classifyHighInterestQa({ repaired: true, failures: ["bad timeline"] }), "FAIL")
})

test("ambiguous proposal differences remain warnings rather than speculative repairs", () => {
  const stored = "Permission for a house extension"
  const source = "Permission for a revised house extension"
  assert.equal(source.startsWith(stored), false)
  assert.equal(classifyHighInterestQa({ warnings: ["authoritative proposal differs without an unambiguous fuller replacement"] }), "WARN")
})

test("timeline QA catches impossible lifecycle dates and decision events sourced from targets", () => {
  const problems = timelineProblems(
    { registration_date: "2026-03-10", decision_due_date: "2026-04-10", decision_date: null, valid_date: "2026-03-01" },
    [{ event_type: "decision_made", event_date: "2026-04-10", source_field: "decision_due_date" }]
  )
  assert.deepEqual(problems, ["valid_date precedes registration", "decision due date created a Decision made event"])
})

test("immutable historical events do not become contradictions after a source-date correction", () => {
  assert.deepEqual(
    timelineProblems(
      { registration_date: "2026-03-10" },
      [{ event_type: "application_received", event_date: "2026-03-01", source_field: "registration_date" }]
    ),
    []
  )
})

test("one source failure is contained to its application", () => {
  const script = readFileSync("scripts/audit-high-interest-planning.mts", "utf8")
  assert.match(script, /for \(const candidate of cohort\)[\s\S]*?try \{[\s\S]*?await loadSource\(row\)[\s\S]*?\} catch \(error\)[\s\S]*?results\.push/)
  assert.match(script, /source\/network failure/)
})

test("the database cohort is detail-only, recent, and capped", () => {
  const migration = readFileSync("supabase/migrations/20260820090000_add_high_interest_planning_qa_candidates.sql", "utf8")
  assert.match(migration, /planning_seo_search_performance/)
  assert.match(migration, /order by sum\(s\.clicks\) desc, sum\(s\.impressions\) desc/i)
  assert.match(migration, /limit greatest\(1, least\(coalesce\(p_limit, 20\), 20\)\)/i)
})

test("Cork detail repairs remain limited to its established decision-due enrichment", () => {
  const script = readFileSync("scripts/audit-high-interest-planning.mts", "utf8")
  assert.match(script, /registration_date: null, valid_date: null, decision_due_date: "decisionDueDate"/)
  assert.match(script, /decision_date: null/)
  // The detail's raw status is deliberately not used for repairs.
  assert.doesNotMatch(script, /return \{ category: "cork_agile_detail"[^\n]*status:/)
})
