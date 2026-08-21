import assert from "node:assert/strict"
import test from "node:test"
import {
  councilStatusPresentation,
  meaningfulPlanningValue,
  planningProposalSummary,
  planningProposalTitle,
  presentPlanningProposal,
} from "../lib/planning-presentation"

test("planning headings prefer a concise first complete sentence", () => {
  const fullProposal =
    "Permission for alterations and extensions to the existing dwelling. The proposed works comprise a converted garage, rear extension, new porch and detached domestic garage."

  assert.equal(
    planningProposalTitle(fullProposal),
    "Permission for alterations and extensions to the existing dwelling."
  )
})

test("planning headings always capitalize their first letter", () => {
  assert.equal(
    planningProposalTitle("to retain indefinitely existing dog boarding kennels and a storage shed"),
    "To retain indefinitely existing dog boarding kennels and a storage shed"
  )
  assert.equal(
    planningProposalTitle("(to retain) an existing storage shed"),
    "(To retain) an existing storage shed"
  )
})

test("planning abbreviations do not create false title sentence boundaries", () => {
  assert.equal(
    planningProposalTitle("The works include 2no. modified shipping containers for the site. Further details follow."),
    "The works include 2no. modified shipping containers for the site."
  )
  assert.equal(
    planningProposalTitle("See application ref. 21/4057 for the related permission. Further details follow."),
    "See application ref. 21/4057 for the related permission."
  )
})

test("genuine prose sentence boundaries remain the title boundary", () => {
  assert.equal(
    planningProposalTitle("Permission for alterations to the dwelling. The works include a rear extension."),
    "Permission for alterations to the dwelling."
  )
})

test("Boxd-style retention proposals become concise source-derived titles", () => {
  const proposal =
    "The development to be retained consists of (1) the erection of 2no. modified shipping containers for use as a drive-thru coffee kiosk, with ancillary storage and staff facilities; associated signage and site works."
  const title = planningProposalTitle(proposal)

  assert.equal(
    title,
    "Retention: erection of 2no. modified shipping containers for use as a drive-thru coffee kiosk…"
  )
  assert.match(title, /drive-thru coffee kiosk/)
  assert.doesNotMatch(title, /\(1\)/)
  assert.doesNotMatch(title, /2no\.?…$/)
  assert.ok(title.length <= 120)
})

test("planning headings cap long single-sentence proposals at a clause boundary", () => {
  const fullProposal =
    "Permission for construction of a replacement dwelling with revised access arrangements, installation of a wastewater treatment system and polishing filter, landscaping works and all associated site development works"
  const heading = planningProposalTitle(fullProposal)

  assert.equal(
    heading,
    "Permission for construction of a replacement dwelling with revised access arrangements…"
  )
  assert.ok(heading.length <= 120)
  assert.doesNotMatch(heading, /\s\w{1,3}…$/)
})

test("planning metadata summaries use the same boundary-safe source-neutral treatment", () => {
  const proposal =
    "Retention permission for alterations to an agricultural building including revised elevations and internal layout changes, together with drainage works and landscaping"
  const summary = planningProposalSummary(proposal, "Fallback", 100)

  assert.equal(
    summary,
    "Retention permission for alterations to an agricultural building including revised elevations…"
  )
  assert.ok(summary.length <= 100)
})

test("short source-truncated proposals are sanitized before title and summary length caps", () => {
  const original =
    "Permission for construction of two storey dwelling house, detached domestic gara"
  const safe = "Permission for construction of two storey dwelling house…"

  assert.equal(planningProposalTitle(original), safe)
  assert.equal(planningProposalSummary(original), safe)
  assert.doesNotMatch(planningProposalTitle(original), /\bgara$/i)
  assert.doesNotMatch(planningProposalSummary(original), /\bgara$/i)
})

test("a dangling numbered proposal is shortened at a defensible clause boundary", () => {
  const original =
    "Permission for: 1) Demolition of existing attached garage on the west side, 2) P"
  const result = presentPlanningProposal(original)

  assert.equal(
    result.display,
    "Permission for demolition of existing attached garage on the west side…"
  )
  assert.equal(result.isLikelyTruncated, true)
  assert.equal(result.original, original)
})

test("complete short and long proposals are left unchanged", () => {
  const shortProposal = "Permission for a single-storey rear extension."
  const longProposal =
    "Permission for the construction of a dwelling, alterations to the existing entrance, connection to public services and all associated site works."

  assert.deepEqual(presentPlanningProposal(shortProposal), {
    display: shortProposal,
    original: null,
    isLikelyTruncated: false,
  })
  assert.equal(presentPlanningProposal(longProposal).display, longProposal)
})

test("proposal text at the observed import limit avoids a broken trailing fragment", () => {
  const original =
    "Permission for construction of two storey dwelling house, detached domestic gara"
  const result = presentPlanningProposal(original)

  assert.equal(result.display, "Permission for construction of two storey dwelling house…")
  assert.equal(result.original, original)
  assert.equal(result.isLikelyTruncated, true)
})

test("missing proposal text uses the supplied fallback without claiming truncation", () => {
  assert.deepEqual(presentPlanningProposal(null, "Proposal not recorded"), {
    display: "Proposal not recorded",
    original: null,
    isLikelyTruncated: false,
  })
})

test("optional planning values omit source absence markers", () => {
  for (const value of [null, undefined, "", "  ", "Not recorded", "Not recorded in source", "N/A", "null"]) {
    assert.equal(meaningfulPlanningValue(value), null)
  }
  assert.equal(meaningfulPlanningValue("  Conditional  "), "Conditional")
})

test("council status is suppressed when it normalizes to the displayed lifecycle", () => {
  assert.equal(councilStatusPresentation("Decision Made", "decision_made"), null)
  assert.equal(councilStatusPresentation("Decision Issued", "decision_made"), null)
  assert.equal(councilStatusPresentation(" New Application ", "registered"), null)
})

test("council status remains available when it adds source information", () => {
  assert.equal(councilStatusPresentation("Withdrawn", "registered"), "Withdrawn")
  assert.equal(councilStatusPresentation("Council-specific wording", "unknown"), "Council-specific wording")
})

test("decision outcome remains separate from lifecycle presentation", () => {
  assert.equal(councilStatusPresentation("Decision Made", "decision_made"), null)
  assert.equal(meaningfulPlanningValue("Refused"), "Refused")
  assert.equal(meaningfulPlanningValue("N/A"), null)
})
