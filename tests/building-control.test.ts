import assert from "node:assert/strict"
import test from "node:test"
import React from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { PlanningTimeline } from "../components/PlanningTimeline"
import { completionCertificateLabel, deriveConstructionStatus, resolveExactBcmsMatch } from "../lib/building-control"
import { buildReconstructedPlanningEvents } from "../lib/planning-events"

test("partial completion wording never claims a whole development completed", () => {
  assert.equal(completionCertificateLabel(3), "Completion certificate validated (3 units)")
})

test("timeline changes its heading and attributes construction records only when present", () => {
  const planning = buildReconstructedPlanningEvents({ registration_date: "2024-01-01" })
  assert.match(renderToStaticMarkup(React.createElement(PlanningTimeline, { events: planning })), /Planning timeline/)
  const construction = [{ event_type: "works_commenced" as const, event_date: "2024-05-01", detected_at: "2026-08-21T00:00:00Z", event_source: "nbco_bcms_open_data", source_field: "CN_Commencement_Date", label: "Works commenced", old_value: null, new_value: "2024-05-01", raw_source_value: "CN1", provenance: "reconstructed" as const, event_key: "bcms:1" }]
  const html = renderToStaticMarkup(React.createElement(PlanningTimeline, { events: [...planning, ...construction] }))
  assert.match(html, /Planning and construction timeline/)
  assert.match(html, /Official NBCO\/BCMS data/)
})

test("timeline explains construction when the planning outcome is missing", () => {
  const planning = buildReconstructedPlanningEvents({ registration_date: "2024-01-01" })
  const construction = [{ event_type: "works_commenced" as const, event_date: "2024-05-01", detected_at: "2026-08-21T00:00:00Z", event_source: "nbco_bcms_open_data", source_field: "CN_Commencement_Date", label: "Works commenced", old_value: null, new_value: "2024-05-01", raw_source_value: "CN1", provenance: "reconstructed" as const, event_key: "bcms:1" }]
  const html = renderToStaticMarkup(React.createElement(PlanningTimeline, { events: [...planning, ...construction] }))
  assert.match(html, /Planning outcome not available in OpenList/)
  assert.match(html, /Later official building-control records show construction activity/)
  assert.ok(html.indexOf("Planning outcome not available in OpenList") < html.indexOf("Works commenced"))

  const completePlanning = buildReconstructedPlanningEvents({
    registration_date: "2024-01-01",
    decision_date: "2024-03-01",
    decision_text: "GRANT PERMISSION",
  })
  const completeHtml = renderToStaticMarkup(React.createElement(PlanningTimeline, { events: [...completePlanning, ...construction] }))
  assert.doesNotMatch(completeHtml, /Planning outcome not available in OpenList/)
})

test("exact matching refuses ambiguity and treats unmatched as safe", () => {
  assert.deepEqual(resolveExactBcmsMatch([], false), { outcome: "unmatched", applicationId: null })
  assert.deepEqual(resolveExactBcmsMatch(["one", "two"], false), { outcome: "ambiguous", applicationId: null })
  assert.deepEqual(resolveExactBcmsMatch(["one"], true), { outcome: "ambiguous", applicationId: null })
  assert.deepEqual(resolveExactBcmsMatch(["one"], false), { outcome: "linked", applicationId: "one" })
})

test("phased evidence never marks the whole scheme completed", () => {
  assert.equal(deriveConstructionStatus([{ commencementDate: "2025-01-01", totalPhases: 3, completionCertificateCount: 1, completionUnits: 20 }], 20), "commenced")
  assert.equal(deriveConstructionStatus([
    { commencementDate: "2025-01-01", completionCertificateCount: 1, completionUnits: 20 },
    { commencementDate: "2025-02-01", completionCertificateCount: 1, completionUnits: 20 },
  ], 40), "commenced")
  assert.equal(deriveConstructionStatus([{ commencementDate: "2025-01-01", totalPhases: 1, completionCertificateCount: 1, completionUnits: 40 }], 40), "completed")
})
