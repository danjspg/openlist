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

test("legacy high-interest ranking still ranks clicks before impressions", () => {
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

test("Vercel planning detail paths resolve to authoritative application identities", () => {
  assert.deepEqual(
    parsePlanningDetailUrl("https://www.openlist.ie/planning/galway-county/ref-MjY2MTIxNA"),
    { localAuthorityCode: "GALWAYCOCO", reference: "2661214" }
  )
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
  assert.match(script, /for \(const candidate of batch\)[\s\S]*?try \{[\s\S]*?await loadSource\(row\)[\s\S]*?\} catch \(error\)[\s\S]*?results\.push/)
  assert.match(script, /source\/network failure/)
})

test("traffic-bearing QA is no longer capped at twenty applications", () => {
  const script = readFileSync("scripts/audit-high-interest-planning.mts", "utf8")
  assert.doesNotMatch(script, /PLANNING_HIGH_INTEREST_QA_LIMIT/)
  assert.doesNotMatch(script, /openlist_high_interest_planning_qa_candidates/)
  assert.match(script, /current\.clicks \+= Number\(row\.clicks \|\| 0\)/)
  assert.match(script, /filter\(\(\[, value\]\) => value\.clicks > 0\)/)
  assert.match(script, /for \(let offset = 0; offset < cohort\.length; offset \+= batchSize\)/)
})

test("Vercel visitor traffic is a first-class QA candidate source", () => {
  const script = readFileSync("scripts/audit-high-interest-planning.mts", "utf8")
  assert.match(script, /readVercelAnalyticsConfig/)
  assert.match(script, /topVercelPaths/)
  assert.match(script, /vercel-web-analytics/)
  assert.match(script, /startswith\(requestPath, '\/planning\/'\)/)
  assert.match(script, /vercelExpandedBeyondTop100/)
  assert.match(script, /truncatedPartitions/)
})

test("zero-click Search Console exposure remains a small supplementary QA lane", () => {
  const script = readFileSync("scripts/audit-high-interest-planning.mts", "utf8")
  assert.match(script, /PLANNING_QA_SEARCH_EXPOSURE_LIMIT \|\| 20/)
  assert.match(script, /value\.clicks === 0 && value\.impressions > 0/)
  assert.match(script, /search-console-exposure/)
})

test("the daily workflow feeds Vercel traffic into QA and revalidates repairs", () => {
  const workflow = readFileSync(".github/workflows/planning-seo.yml", "utf8")
  assert.match(workflow, /Audit traffic-bearing Planning pages/)
  assert.match(workflow, /VERCEL_TOKEN: \$\{\{ secrets\.VERCEL_TOKEN \}\}/)
  assert.match(workflow, /PLANNING_TRAFFIC_QA_BATCH_SIZE: "25"/)
  assert.match(workflow, /Revalidate QA-repaired Planning pages/)
  assert.match(workflow, /drain-planning-revalidation\.mjs/)
})

test("Cork detail repairs remain limited to its established decision-due enrichment", () => {
  const script = readFileSync("scripts/audit-high-interest-planning.mts", "utf8")
  assert.match(script, /registration_date: null, valid_date: null, decision_due_date: "decisionDueDate"/)
  assert.match(script, /decision_date: null/)
  // The detail's raw status is deliberately not used for repairs.
  assert.doesNotMatch(script, /return \{ category: "cork_agile_detail"[^\n]*status:/)
})

test("QA contains source failures but exposes write failures as failures", () => {
  const script = readFileSync("scripts/audit-high-interest-planning.mts", "utf8")
  assert.match(script, /source = await loadSource\(row\)[\s\S]*?source unavailable:/)
  assert.match(script, /outcome: "FAIL"[\s\S]*?QA \$\{dryRun \? "transformation" : "database\/write"\} failure/)
  assert.match(script, /if \(value === null\)[\s\S]*?not cleared automatically/)
})

test("dry-run labels repairs as repairable without changing write-run labels", () => {
  const script = readFileSync("scripts/audit-high-interest-planning.mts", "utf8")
  assert.match(script, /dryRun && classified === "REPAIRED" \? "REPAIRABLE" : classified/)
})

test("status updates use the existing database normalisation trigger", () => {
  const migration = readFileSync("supabase/migrations/20260818160000_add_planning_timeline_events.sql", "utf8")
  const script = readFileSync("scripts/audit-high-interest-planning.mts", "utf8")
  assert.match(migration, /new\.normalized_status := public\.openlist_normalize_planning_status\(new\.status\)/)
  assert.match(migration, /before insert or update of status/)
  assert.match(script, /changes\.status = source\.status/)
})
