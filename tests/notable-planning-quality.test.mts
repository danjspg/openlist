import assert from "node:assert/strict"
import test from "node:test"
import { compact, hasExternalStatusPrecedence, sameStatus, shouldRepairProposal } from "../scripts/audit-notable-planning-quality.mts"

test("proposal repair only accepts a materially fuller source", () => {
  assert.equal(shouldRepairProposal("Short proposal", "Short proposal with materially more authoritative detail"), true)
  assert.equal(shouldRepairProposal("Already complete proposal", "Already complete proposal"), false)
  assert.equal(shouldRepairProposal("Longer stored proposal than source", "short source"), false)
})

test("status comparison ignores case and whitespace only", () => {
  assert.equal(sameStatus("Decision   Made", "decision made"), true)
  assert.equal(sameStatus("NEW APPLICATION", "DECISION MADE"), false)
  assert.equal(compact("  a   b  "), "a b")
})

test("higher-priority ePlan, ACP, and appeal decision status is preserved", () => {
  assert.equal(hasExternalStatusPrecedence({ status_source: "acp_appeal" }), true)
  assert.equal(hasExternalStatusPrecedence({ appeal_decision_source: "acp" }), true)
  assert.equal(hasExternalStatusPrecedence({ appeal_decision_date: "2026-08-01" }), true)
  assert.equal(hasExternalStatusPrecedence({ status_source: "eplan" }), true)
  assert.equal(hasExternalStatusPrecedence({ status_source: null }), false)
})
