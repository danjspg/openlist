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
  AGILE_REQUEST_DELAY_MS,
  NATIONAL_DETAIL_BUDGET,
  NATIONAL_DETAIL_BUDGET_MAX,
  NATIONAL_UPSERT_BATCH_SIZE,
  fetchAgileDetailsByReference,
  fetchAgileJson,
  enrichChangedNationalRecords,
  mapApplication,
  retryAfterMs,
  sortDetailCandidates,
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

test("normal detail enrichment is bounded, newest-first, and reports deferred records", async () => {
  const records = [
    { reference: "older", registration_date: "2026-01-01", proposal: "x".repeat(80), source_url: "https://x/application-details/1" },
    { reference: "newer-b", registration_date: "2026-02-01", proposal: "x".repeat(80), source_url: "https://x/application-details/2" },
    { reference: "newer-a", registration_date: "2026-02-01", proposal: "x".repeat(80), source_url: "https://x/application-details/3" },
  ]
  assert.deepEqual(sortDetailCandidates(records).map((record) => record.reference), ["newer-a", "newer-b", "older"])
  const details = await fetchAgileDetailsByReference(
    { code: "WEXFORD", name: "Wexford County Council" }, records,
    { failureMode: "best-effort", budget: 1, request: async () => null }
  )
  assert.equal(details.detailReport.detailCandidates, 3)
  assert.equal(details.detailReport.detailBudget, 1)
  assert.equal(details.detailReport.detailAttempted, 1)
  assert.equal(details.detailReport.detailDeferred, 2)
  assert.equal(details.detailReport.detailCircuitBroken, false)
  assert.equal(NATIONAL_DETAIL_BUDGET, 25)
  assert.equal(NATIONAL_DETAIL_BUDGET_MAX, 100)
})

test("persistent optional Agile failure stops an authority locally while preserving prior details", async () => {
  const records = [
    { reference: "first", registration_date: "2026-02-02", proposal: "x".repeat(80), source_url: "https://x/application-details/1" },
    { reference: "second", registration_date: "2026-02-01", proposal: "x".repeat(80), source_url: "https://x/application-details/2" },
  ]
  let requests = 0
  const details = await fetchAgileDetailsByReference(
    { code: "WEXFORD", name: "Wexford County Council" }, records,
    {
      failureMode: "best-effort",
      request: async () => {
        requests += 1
        if (requests === 1) return { fullProposal: "Full first proposal" }
        const error: Error & { status?: number } = new Error("HTTP 429")
        error.status = 429
        throw error
      },
    }
  )
  assert.equal(requests, 2)
  assert.equal(details.get("first")?.fullProposal, "Full first proposal")
  assert.equal(details.has("second"), false)
  assert.equal(details.detailReport.detailCircuitBroken, true)
})

test("Retry-After parsing supports seconds and HTTP dates without slowing ArcGIS", () => {
  assert.equal(retryAfterMs("7", 0), 7000)
  assert.equal(retryAfterMs("Thu, 01 Jan 1970 00:00:10 GMT", 0), 10000)
  assert.equal(AGILE_REQUEST_DELAY_MS, 1000)
})

test("Agile requests honor Retry-After before a bounded retry", async () => {
  const delays: number[] = []
  let calls = 0
  const data = await fetchAgileJson("https://example.test", "test", {}, {
    sleepFn: async (ms: number) => { delays.push(ms) },
    fetchImpl: async () => {
      calls += 1
      if (calls === 1) return {
        ok: false, status: 429,
        headers: { get: () => "7" },
      }
      return { ok: true, json: async () => ({ ok: true }) }
    },
  })
  assert.deepEqual(data, { ok: true })
  assert.equal(calls, 2)
  assert.ok(delays.includes(7000))
})

test("national writes start gently while preserving bounded adaptive upserts", () => {
  assert.equal(NATIONAL_UPSERT_BATCH_SIZE, 50)
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
  assert.match(nationalImporter, /boundedEnvNumber\("PLANNING_AGILE_REQUEST_DELAY_MS", 1000, 0\)/)
  assert.match(nationalBackfill, /failureMode: "strict"/)
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
