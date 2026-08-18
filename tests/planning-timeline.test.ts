import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"
import React from "react"
import { renderToStaticMarkup } from "react-dom/server"

import { PlanningTimeline } from "../components/PlanningTimeline"
import {
  buildReconstructedPlanningEvents,
  detectObservedPlanningEvents,
  sortPlanningEvents,
  resolvePlanningEventDateCorrections,
  type PlanningEvent,
} from "../lib/planning-events"
import {
  isTerminalPlanningStatus,
  normalisePlanningStatus,
  planningStatusLabel,
} from "../lib/planning-status"

test("status normalization covers real Cork and national source values", () => {
  const cases = [
    ["Application Closed", "finalised"],
    ["Planning Application Withdrawn", "withdrawn"],
    ["Application appealed", "appealed"],
    ["Further Information", "further_information_requested"],
    ["Further Information Received", "further_information_received"],
    ["APPLICATION FINALISED", "finalised"],
    ["INCOMPLETED APPLICATION", "invalid"],
    ["Decision Notice Issued", "decision_made"],
    ["Final Grant", "final_grant"],
    ["Appeal decided", "appeal_decided"],
    ["PRE_VALIDATION", "pre_validation"],
    ["Officer Allocation", "under_assessment"],
    ["Additional Information Requested", "further_information_requested"],
    ["AI Received", "further_information_received"],
    ["Application Under Review", "under_assessment"],
    ["Application archived", "finalised"],
  ] as const

  for (const [raw, expected] of cases) {
    assert.equal(normalisePlanningStatus(raw), expected, raw)
  }
  assert.equal(normalisePlanningStatus("n/a"), "unknown")
  assert.equal(normalisePlanningStatus("Unexpected council wording"), "unknown")
  assert.equal(planningStatusLabel("unknown"), "Status not classified")
  assert.equal(isTerminalPlanningStatus("decision_made"), false)
  assert.equal(isTerminalPlanningStatus("withdrawn"), true)
})

test("source-date corrections keep history immutable while resolving the public milestone", () => {
  const received = buildReconstructedPlanningEvents({ registration_date: "2026-06-14" })[0]
  const correction: PlanningEvent = {
    ...received,
    id: "correction",
    event_type: "source_date_corrected",
    event_date: "2026-08-18",
    detected_at: "2026-08-18T12:00:00Z",
    event_source: "openlist_refresh",
    label: "Application received date updated",
    old_value: "2026-06-14",
    new_value: "2026-06-15",
    provenance: "observed",
    event_key: "observed:registration-date-correction",
  }
  const resolved = resolvePlanningEventDateCorrections([received, correction])
  assert.equal(resolved.find((event) => event.event_type === "application_received")?.event_date, "2026-06-15")
  const html = renderToStaticMarkup(
    React.createElement(PlanningTimeline, { events: [received, correction] })
  )
  assert.match(html, /15 Jun 2026/)
  assert.doesNotMatch(html, /date updated/)
})

test("historical reconstruction uses only valid source-backed dates", () => {
  const onlyRegistration = buildReconstructedPlanningEvents({
    status: "WITHDRAWN",
    registration_date: "2012-01-03",
    decision_date: "not-a-date",
  })
  assert.deepEqual(onlyRegistration.map((event) => event.event_type), [
    "application_received",
  ])

  const rich = buildReconstructedPlanningEvents({
    registration_date: "2026-01-12",
    valid_date: "2026-01-12",
    decision_date: "2026-03-17",
    decision_text: "Grant permission",
    final_grant_date: "2026-04-08",
    appeal_lodged_date: "2026-04-20",
    appeal_decision_date: "2026-07-01",
  })
  assert.deepEqual(rich.map((event) => event.event_type), [
    "application_received",
    "application_validated",
    "decision_made",
    "final_grant",
    "appeal_lodged",
    "appeal_decided",
  ])
  assert.equal(rich[2].label, "Decision: Grant permission")
  assert.equal(new Set(rich.map((event) => event.event_key)).size, rich.length)
})

test("same-day milestones remain distinct and deterministically ordered", () => {
  const events = buildReconstructedPlanningEvents({
    registration_date: "2026-01-12",
    valid_date: "2026-01-12",
    decision_date: "2026-01-12",
    final_grant_date: "2026-01-12",
  })
  assert.deepEqual(events.map((event) => event.event_type), [
    "application_received",
    "application_validated",
    "decision_made",
    "final_grant",
  ])
})

test("equivalent raw statuses and unchanged meaningful fields create no observed event", () => {
  const events = detectObservedPlanningEvents(
    { status: "Application Appealed", decision_text: "Grant permission" },
    { status: " application appealed ", decision_text: "  GRANT   PERMISSION " },
    "2026-08-18T12:00:00Z"
  )
  assert.deepEqual(events, [])
})

test("genuine status changes and newly populated milestones are recorded without duplication", () => {
  const statusOnly = detectObservedPlanningEvents(
    { status: "New Application" },
    { status: "Further Information" },
    "2026-08-18T12:00:00Z"
  )
  assert.equal(statusOnly.length, 1)
  assert.equal(statusOnly[0].event_type, "status_changed")
  assert.equal(statusOnly[0].new_value, "further_information_requested")

  const decision = detectObservedPlanningEvents(
    { status: "New Application", decision_date: null },
    {
      status: "Decision Made",
      decision_date: "2026-08-18",
      decision_text: "Refused",
    },
    "2026-08-18T12:00:00Z"
  )
  assert.deepEqual(decision.map((event) => event.event_type), ["decision_made"])
  assert.equal(decision[0].provenance, "observed")
})

test("source date corrections and multiple observed events sort consistently", () => {
  const events = detectObservedPlanningEvents(
    { status: "Decision Made", decision_date: "2026-08-10", decision_text: "Refused" },
    { status: "Appealed", decision_date: "2026-08-11", decision_text: "Grant permission" },
    "2026-08-18T12:00:00Z"
  )
  assert.deepEqual(events.map((event) => event.event_type), [
    "source_date_corrected",
    "decision_changed",
    "status_changed",
  ])
})

test("timeline hides empty state and labels provenance accessibly", () => {
  assert.equal(renderToStaticMarkup(React.createElement(PlanningTimeline, { events: [] })), "")
  const validityOnly = buildReconstructedPlanningEvents({ valid_date: "2026-01-13" })
  assert.equal(
    renderToStaticMarkup(React.createElement(PlanningTimeline, { events: validityOnly })),
    ""
  )

  const event = buildReconstructedPlanningEvents({ registration_date: "2026-01-12" })[0]
  const observed: PlanningEvent = {
    ...event,
    id: "observed",
    event_type: "status_changed",
    event_date: "2026-02-01",
    provenance: "observed",
    label: "Status changed to Under appeal",
    old_value: "decision_made",
    new_value: "appealed",
    event_key: "observed-status",
  }
  const html = renderToStaticMarkup(
    React.createElement(PlanningTimeline, { events: sortPlanningEvents([observed, event]) })
  )
  assert.match(html, /Planning timeline/)
  assert.match(html, /Council record/)
  assert.match(html, /Observed by OpenList/)
  assert.match(html, /Previously Decision made/)
  assert.match(html, /<ol/)
  assert.match(html, /<time dateTime="2026-01-12"/)
})

test("migration defines immutable deduplicated events and database backfill", async () => {
  const migration = await readFile(
    new URL(
      "../supabase/migrations/20260818160000_add_planning_timeline_events.sql",
      import.meta.url
    ),
    "utf8"
  )
  assert.match(migration, /normalized_status text not null default 'unknown'/i)
  assert.match(migration, /unique \(application_id, event_key\)/i)
  assert.match(migration, /provenance in \('reconstructed', 'observed'\)/i)
  assert.match(migration, /openlist_capture_planning_events/i)
  assert.match(migration, /after insert or update of status,decision_text/i)
  assert.match(migration, /openlist_backfill_planning_events/i)
  assert.match(migration, /on conflict \(application_id,event_key\) do nothing/i)
  assert.doesNotMatch(migration, /max\(id\)/i)
  assert.doesNotMatch(migration, /status.*then.*final_grant_date/i)
})
