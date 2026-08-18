import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

import {
  authoritativeNationalProposal,
  isNationalProposalDetailCandidate,
  nationalPlanningSourceUrl,
  parseNationalArcgisDate,
} from "../lib/national-planning-source.mjs"
import {
  enrichChangedNationalRecords,
  mapApplication,
} from "../scripts/ingest-national-planning-applications.mjs"
import { applyLifecycleBatch } from "../scripts/backfill-national-planning-lifecycle.mjs"

test("national ArcGIS epoch dates retain UTC calendar dates in summer and winter", () => {
  assert.equal(parseNationalArcgisDate(1781481600000), "2026-06-15")
  assert.equal(parseNationalArcgisDate("1797292800000"), "2026-12-15")
  assert.equal(parseNationalArcgisDate(null), null)
  assert.equal(parseNationalArcgisDate("not-a-date"), null)
})

test("Fingal fixed-length proposal is replaced by its authoritative detail value", () => {
  const source = "Permission is sought for the erection of a short section of ARMCO barr"
  const detail =
    "Permission is sought for the erection of a short section of ARMCO barrier system at the entrance of Dublin Airport Premier Inn."

  assert.equal(source.length, 70)
  assert.equal(isNationalProposalDetailCandidate("FINGAL", source), true)
  assert.equal(authoritativeNationalProposal(source, detail), detail)
  assert.equal(authoritativeNationalProposal(detail, source), detail)
})

test("only the proven authority-specific proposal ceilings request detail enrichment", () => {
  assert.equal(isNationalProposalDetailCandidate("DLR", "x".repeat(80)), true)
  assert.equal(isNationalProposalDetailCandidate("WEXFORD", "x".repeat(80)), true)
  assert.equal(isNationalProposalDetailCandidate("FINGAL", "x".repeat(80)), false)
  assert.equal(isNationalProposalDetailCandidate("KILDARE", "x".repeat(80)), false)
})

test("broken or absent Agile links are replaced with reference-scoped official searches", () => {
  assert.match(
    nationalPlanningSourceUrl("FINGAL", "F26A/0371E") || "",
    /^https:\/\/planning\.agileapplications\.ie\/fingal\/search-applications\/results\?criteria=/
  )
  assert.equal(
    nationalPlanningSourceUrl("KILDARE", "2660419", "https://example.test/application"),
    "https://example.test/application"
  )
})

test("national detail enrichment is skipped when changed rows have no proven ceiling", async () => {
  let calls = 0
  const records = [{ reference: "2660419", proposal: "A short complete proposal" }]
  const enriched = await enrichChangedNationalRecords(
    records,
    { code: "KILDARE", name: "Kildare County Council" },
    async () => {
      calls += 1
      return new Map()
    }
  )

  assert.equal(calls, 0)
  assert.equal(enriched, records)
})

test("national detail enrichment uses the full Fingal proposal for a changed ceiling row", async () => {
  const source = "Permission is sought for the erection of a short section of ARMCO barr"
  const full =
    "Permission is sought for the erection of a short section of ARMCO barrier system at the entrance of Dublin Airport Premier Inn."
  const records = [{ reference: "F26A/0371E", proposal: source }]
  const enriched = await enrichChangedNationalRecords(
    records,
    { code: "FINGAL", name: "Fingal County Council" },
    async () => new Map([["F26A/0371E", { fullProposal: full }]])
  )

  assert.equal(enriched[0].proposal, full)
})

test("a missing optional detail record preserves the source proposal", async () => {
  const source = "x".repeat(80)
  const records = [{ reference: "20160005", proposal: source }]
  const enriched = await enrichChangedNationalRecords(
    records,
    { code: "WEXFORD", name: "Wexford County Council" },
    async () => new Map()
  )

  assert.equal(enriched[0].proposal, source)
})

test("national bulk rows map every confirmed lifecycle date without council detail calls", () => {
  const application = mapApplication({
    OBJECTID: 42,
    ApplicationNumber: "26/42",
    FIRequestDate: 1781481600000,
    FIRecDate: 1782345600000,
    WithdrawnDate: 1783209600000,
    DecisionDueDate: 1797292800000,
    ExpiryDate: 1954972800000,
    AppealSubmittedDate: 1784073600000,
    AppealDecisionDate: 1784937600000,
  }, {
    code: "KILDARE",
    name: "Kildare County Council",
  }, { storePayload: true })

  assert.ok(application)
  assert.equal(application.further_information_requested_date, "2026-06-15")
  assert.equal(application.further_information_received_date, "2026-06-25")
  assert.equal(application.withdrawal_date, "2026-07-05")
  assert.equal(application.decision_due_date, "2026-12-15")
  assert.equal(application.expiry_date, "2031-12-14")
  assert.equal(application.appeal_lodged_date, "2026-07-15")
  assert.equal(application.appeal_decision_date, "2026-07-25")
  assert.equal(application.source_payload.FIRequestDate, 1781481600000)
})

test("sparse and malformed national lifecycle dates remain null", () => {
  const application = mapApplication({
    OBJECTID: 43,
    ApplicationNumber: "26/43",
    FIRequestDate: "not-a-date",
  }, {
    code: "DUBLINCITY",
    name: "Dublin City Council",
  }, { storePayload: false })

  assert.ok(application)
  assert.equal(application.further_information_requested_date, null)
  assert.equal(application.further_information_received_date, null)
  assert.equal(application.withdrawal_date, null)
  assert.equal(application.decision_due_date, null)
  assert.equal(application.expiry_date, null)
  assert.equal("source_payload" in application, false)
})

test("proposal backfills prioritize value without increasing their request bounds", async () => {
  const [migration, nationalBackfill, corkBackfill, nationalImporter] = await Promise.all([
    readFile(new URL(
      "../supabase/migrations/20260818201000_prioritize_planning_proposal_backfills.sql",
      import.meta.url
    ), "utf8"),
    readFile(new URL("../scripts/backfill-national-planning-proposals.mjs", import.meta.url), "utf8"),
    readFile(new URL("../scripts/audit-cork-planning-source.mjs", import.meta.url), "utf8"),
    readFile(new URL("../scripts/ingest-national-planning-applications.mjs", import.meta.url), "utf8"),
  ])

  assert.match(migration, /planning_seo_notable/i)
  assert.match(migration, /planning_seo_search_performance/i)
  assert.match(migration, /registration_date >= current_date - interval '2 years'/i)
  assert.match(migration, /order by\s+candidate\.priority/i)
  assert.match(migration, /least\(coalesce\(p_limit, 50\), 100\)/i)
  assert.match(nationalBackfill, /openlist_planning_proposal_backfill_candidates/)
  assert.match(corkBackfill, /openlist_planning_proposal_backfill_candidates/)
  assert.match(corkBackfill, /await sleep\(200\)/)
  assert.match(nationalImporter, /PLANNING_NATIONAL_REQUEST_DELAY_MS \|\| 250/)
})

test("lifecycle backfill adaptively splits a timed-out database batch", async () => {
  const calls: number[] = []
  const supabase = {
    rpc: async (_name: string, { p_rows }: { p_rows: unknown[] }) => {
      calls.push(p_rows.length)
      if (p_rows.length > 250) return { data: null, error: { message: "upstream request timeout" } }
      return {
        error: null,
        data: {
          submitted: p_rows.length,
          matched: p_rows.length,
          updated: p_rows.length,
          eventsInserted: p_rows.length,
          applicationsEnriched: p_rows.length,
          fieldUpdates: { decision_due_date: p_rows.length },
          eventUpdates: { further_information_requested: p_rows.length },
        },
      }
    },
  }
  const records = Array.from({ length: 500 }, (_, id) => ({ id }))
  const report = await applyLifecycleBatch(supabase, records, "test")
  assert.deepEqual(calls, [500, 250, 250])
  assert.equal(report.updated, 500)
  assert.equal(report.fieldUpdates.decision_due_date, 500)
  assert.equal(report.eventUpdates.further_information_requested, 500)
})
