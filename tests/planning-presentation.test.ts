import assert from "node:assert/strict"
import test from "node:test"
import { presentPlanningProposal } from "../lib/planning-presentation"

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
