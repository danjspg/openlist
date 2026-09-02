import assert from "node:assert/strict"
import test from "node:test"
import { compact, externalFailureKind, hasExternalStatusPrecedence, nationalAuthorityForCode, notableMaintenanceOutcome, qualityRetryScope, sameStatus, shouldRepairProposal, sourceRetryDelayMs } from "../scripts/audit-notable-planning-quality.mts"

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

test("quality retry scope clearly distinguishes full and unresolved-only runs", () => {
  assert.equal(qualityRetryScope(false), "all")
  assert.equal(qualityRetryScope(true), "unchecked-only")
})

test("quality source lookups use the national feed source authority names", () => {
  assert.equal(nationalAuthorityForCode("LIMERICK")?.sourceName, "Limerick County Council")
  assert.equal(nationalAuthorityForCode("DLR")?.sourceName, "Dun Laoghaire Rathdown County Council")
  assert.equal(nationalAuthorityForCode("KILDARE")?.sourceName, "Kildare County Council")
  assert.equal(nationalAuthorityForCode("UNKNOWN"), null)
})

test("external source degradation is classified without hiding rate limits", () => {
  assert.equal(externalFailureKind(new Error("Cork detail: HTTP 429")), "rate_limited")
  assert.equal(externalFailureKind(new Error("Wexford detail: HTTP 404")), "not_found")
  assert.equal(externalFailureKind(new Error("request timed out")), "timeout")
  assert.equal(externalFailureKind(new Error("authoritative source record unavailable")), "source_unavailable")
})

test("429 backoff honours Retry-After but remains bounded", () => {
  assert.equal(sourceRetryDelayMs("2", 1), 2000)
  assert.equal(sourceRetryDelayMs("600", 1), 5000)
  assert.equal(sourceRetryDelayMs(null, 2), 1500)
})

test("partial source degradation is non-actionable while internal errors and verified mismatches remain actionable", () => {
  assert.deepEqual(notableMaintenanceOutcome({ total: 537, sourceFailures: 13, internalErrors: 0, repairsRequired: 0 }), {
    outcome: "source_degraded",
    sourceOutcome: "source_degraded",
    sourceFailureRatio: 13 / 537,
    sourceDegradationActionable: false,
  })
  assert.equal(notableMaintenanceOutcome({ total: 100, sourceFailures: 0, internalErrors: 0, repairsRequired: 1 }).outcome, "mismatch")
  assert.equal(notableMaintenanceOutcome({ total: 100, sourceFailures: 0, internalErrors: 1, repairsRequired: 0 }).outcome, "error")
  assert.equal(notableMaintenanceOutcome({ total: 100, sourceFailures: 11, internalErrors: 0, repairsRequired: 0 }).sourceDegradationActionable, true)
  assert.equal(notableMaintenanceOutcome({ total: 100, sourceFailures: 1, persistentSourceFailures: 1, internalErrors: 0, repairsRequired: 0 }).sourceDegradationActionable, true)
})
