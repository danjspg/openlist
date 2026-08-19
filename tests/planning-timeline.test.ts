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
  suppressRedundantPlanningStatusEvents,
  type PlanningEvent,
} from "../lib/planning-events"
import {
  isTerminalPlanningStatus,
  normalisePlanningStatus,
  planningStatusLabel,
} from "../lib/planning-status"
import { decisionDuePresentation } from "../lib/planning-presentation"
import { relativeDecisionDueText } from "../components/DecisionDueRelativeText"

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

test("FI, withdrawal, and appeal events require authoritative dates", () => {
  const events = buildReconstructedPlanningEvents({
    status: "Planning Application Withdrawn",
    further_information_requested_date: "2026-02-04",
    further_information_received_date: "2026-02-24",
    withdrawal_date: "2026-03-03",
    appeal_lodged_date: "2026-05-07",
    appeal_decision_date: "2026-06-22",
  })
  assert.deepEqual(events.map((event) => event.event_type), [
    "further_information_requested",
    "further_information_received",
    "withdrawn",
    "appeal_lodged",
    "appeal_decided",
  ])
  assert.deepEqual(
    buildReconstructedPlanningEvents({ status: "Planning Application Withdrawn" }),
    []
  )
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

  const multipleLifecycleFields = detectObservedPlanningEvents(
    { status: "New Application" },
    {
      status: "Further Information Received",
      further_information_requested_date: "2026-02-04",
      further_information_received_date: "2026-02-24",
    },
    "2026-02-24T12:00:00Z"
  )
  assert.deepEqual(multipleLifecycleFields.map((event) => event.event_type), [
    "further_information_requested",
    "further_information_received",
  ])
})

test("decision due changes are immutable, normalized, retry-safe, and hidden from the public timeline", () => {
  const previous = { decision_due_date: "2026-09-14" }
  const incoming = { decision_due_date: "2026-10-12" }
  const first = detectObservedPlanningEvents(previous, incoming, "2026-08-18T12:00:00Z")
  const retry = detectObservedPlanningEvents(previous, incoming, "2026-08-18T12:00:00Z")
  assert.equal(first.length, 1)
  assert.equal(first[0].event_type, "decision_due_changed")
  assert.equal(first[0].old_value, "2026-09-14")
  assert.equal(first[0].new_value, "2026-10-12")
  assert.equal(first[0].event_key, retry[0].event_key)
  assert.deepEqual(
    detectObservedPlanningEvents(incoming, incoming, "2026-08-19T12:00:00Z"),
    []
  )
  assert.equal(
    renderToStaticMarkup(React.createElement(PlanningTimeline, { events: first })),
    ""
  )
})

test("decision due absolute date is server-rendered and relative text is client-calculated", () => {
  const active = {
    normalized_status: "further_information_received" as const,
    decision_due_date: "2026-09-14",
  }
  assert.deepEqual(decisionDuePresentation(active), {
    date: "2026-09-14",
    formattedDate: "14 September 2026",
  })
  assert.equal(relativeDecisionDueText("2026-09-14", new Date("2026-08-18T12:00:00Z")), "in 27 days")
  assert.equal(
    relativeDecisionDueText("2026-08-18", new Date("2026-08-18T12:00:00Z")),
    "today"
  )
  assert.equal(
    relativeDecisionDueText("2026-08-14", new Date("2026-08-18T12:00:00Z")),
    "4 days ago"
  )
  assert.equal(decisionDuePresentation({ ...active, normalized_status: "finalised" }), null)
  assert.equal(decisionDuePresentation({ ...active, decision_date: "2026-08-17" }), null)
})

test("source-backed milestones suppress redundant status-only timeline entries", () => {
  const sourceEvent = buildReconstructedPlanningEvents({
    further_information_requested_date: "2026-02-04",
  })[0]
  const statusEvent: PlanningEvent = {
    ...sourceEvent,
    event_type: "status_changed",
    event_date: "2026-02-05",
    source_field: "status",
    label: "Status changed to Further information requested",
    new_value: "further_information_requested",
    event_key: "observed:status:registered:further_information_requested:2026-02-05",
  }
  assert.deepEqual(
    suppressRedundantPlanningStatusEvents([statusEvent, sourceEvent]).map((event) => event.event_type),
    ["further_information_requested"]
  )
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

test("national lifecycle migration is set-based, retry-safe, and keeps due changes out of reconstructed history", async () => {
  const migration = await readFile(
    new URL(
      "../supabase/migrations/20260818200000_add_national_planning_lifecycle.sql",
      import.meta.url
    ),
    "utf8"
  )
  assert.match(migration, /further_information_requested_date date null/i)
  assert.match(migration, /decision_due_date date null/i)
  assert.match(migration, /openlist_backfill_national_planning_lifecycle/i)
  assert.match(migration, /on conflict \(application_id,event_key\) do nothing/i)
  assert.match(migration, /decision_due_changed/i)
  assert.match(migration, /old\.decision_due_date is not null/i)
  assert.doesNotMatch(migration, /create index[^;]+decision_due_date/i)
})
