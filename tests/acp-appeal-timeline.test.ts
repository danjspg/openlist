import assert from "node:assert/strict"
import test from "node:test"
import React from "react"
import { renderToStaticMarkup } from "react-dom/server"

import { PlanningTimeline } from "../components/PlanningTimeline"
import type { PlanningEvent } from "../lib/planning-events"

function event(overrides: Partial<PlanningEvent>): PlanningEvent {
  return {
    event_type: "appeal_lodged",
    event_date: "2026-05-01",
    detected_at: "2026-08-26T12:00:00Z",
    event_source: "national_arcgis",
    source_field: "appeal_lodged_date",
    label: "Appeal lodged",
    old_value: null,
    new_value: "2026-05-01",
    raw_source_value: "2026-05-01",
    provenance: "reconstructed",
    event_key: "source:appeal_lodged_date:2026-05-01",
    ...overrides,
  }
}

test("ACP appeal milestones replace same-date council duplicates and link to the official case", () => {
  const council = event({})
  const acp = event({
    event_source: "an_coimisiun_pleanala_open_data",
    source_field: "LODGEDON",
    label: "Appeal lodged with An Coimisiún Pleanála",
    new_value: "PL06S.309055",
    raw_source_value: "PL06S.309055",
    event_key: "acp:PL06S.309055:lodged:2026-05-01",
  })
  const html = renderToStaticMarkup(React.createElement(PlanningTimeline, { events: [council, acp] }))
  assert.equal((html.match(/Appeal lodged with An Coimisiún Pleanála/g) || []).length, 1)
  assert.doesNotMatch(html, />Appeal lodged<\/p>/)
  assert.match(html, /Official An Coimisiún Pleanála data/)
  assert.match(html, /https:\/\/www\.pleanala\.ie\/en-ie\/case\/309055/)
})

test("ACP appeal decisions expose the substantive appeal outcome", () => {
  const acp = event({
    event_type: "appeal_decided",
    event_date: "2026-06-10",
    event_source: "an_coimisiun_pleanala_open_data",
    source_field: "DECIDED_ON",
    label: "Appeal decision: Refuse Permission",
    new_value: "Refuse Permission",
    raw_source_value: "Refuse Permission",
    event_key: "acp:PL06S.309055:decided:2026-06-10",
  })
  const html = renderToStaticMarkup(React.createElement(PlanningTimeline, { events: [acp] }))
  assert.match(html, /Appeal decision: Refuse Permission/)
  assert.match(html, /Official An Coimisiún Pleanála data/)
})
