import assert from "node:assert/strict"
import test from "node:test"

import {
  authoritativeNationalProposal,
  isNationalProposalDetailCandidate,
  nationalPlanningSourceUrl,
  parseNationalArcgisDate,
} from "../lib/national-planning-source.mjs"
import { enrichChangedNationalRecords } from "../scripts/ingest-national-planning-applications.mjs"

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
