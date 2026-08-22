import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

import {
  EVENT_TYPES,
  WATCH_FIELDS,
  applicationUpdates,
  changedWatchFields,
  createPlanningAlertWatcher,
  sourceState,
  upgradeWatchComparisonState,
} from "../lib/planning-alert-watch.mjs"

async function source(path: string) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8")
}

const emptyBaseline = sourceState({ status: "REGISTERED" })

test("exact national source uses the established decision and grant fields", async () => {
  const watcher = createPlanningAlertWatcher({
    supabase: {},
    fetchImpl: (async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        features: [{ attributes: {
          ApplicationNumber: "26/42",
          ApplicationStatus: "Decision Made",
          Decision: "Refused",
          DecisionDate: Date.UTC(2026, 7, 22),
          GrantDate: Date.UTC(2026, 8, 18),
          AppealDecisionDate: Date.UTC(2026, 9, 30),
        } }],
      }),
    }) as unknown as Response) as typeof fetch,
  })
  const result = await watcher.fetchSourceState({
    local_authority_code: "DUBLINCITY",
    source_application_id: 42,
    reference: "26/42",
  })

  assert.equal(result.strategy, "national_arcgis_exact")
  assert.equal(result.source.ok, true)
  const official = result.source as Record<string, unknown>
  assert.equal(official.decision_text, "Refused")
  assert.equal(official.decision_date, "2026-08-22")
  assert.equal(official.final_grant_date, "2026-09-18")
  assert.equal(official.appeal_decision_date, "2026-10-30")
})

test("decision and final-grant lifecycle fields are watch-observed after baseline", () => {
  const granted = sourceState({
    status: "DECISION MADE",
    decision_date: "2026-08-22",
    decision_text: "Grant Permission",
  })
  const refused = sourceState({
    status: "DECISION MADE",
    decision_date: "2026-08-22",
    decision_text: "Refused",
  })
  const finalGrant = sourceState({ ...granted, final_grant_date: "2026-09-18" })

  assert.deepEqual(changedWatchFields(emptyBaseline, granted), ["status", "decision_date", "decision_text"])
  assert.deepEqual(changedWatchFields(emptyBaseline, refused), ["status", "decision_date", "decision_text"])
  assert.deepEqual(changedWatchFields(granted, finalGrant), ["final_grant_date"])
  assert.deepEqual(EVENT_TYPES.decision_date, ["decision_made"])
  assert.deepEqual(EVENT_TYPES.decision_text, ["decision_changed"])
  assert.deepEqual(EVENT_TYPES.final_grant_date, ["final_grant"])
})

test("FI, appeal, withdrawal, and terminal status mappings remain alertable", () => {
  assert.deepEqual(EVENT_TYPES.further_information_requested_date, ["further_information_requested"])
  assert.deepEqual(EVENT_TYPES.further_information_received_date, ["further_information_received"])
  assert.deepEqual(EVENT_TYPES.appeal_lodged_date, ["appeal_lodged"])
  assert.deepEqual(EVENT_TYPES.appeal_decision_date, ["appeal_decided"])
  assert.deepEqual(EVENT_TYPES.withdrawal_date, ["withdrawn"])
  assert.deepEqual(EVENT_TYPES.status, ["status_changed", "withdrawn"])
  assert.ok(WATCH_FIELDS.includes("decision_date"))
  assert.ok(WATCH_FIELDS.includes("decision_text"))
  assert.ok(WATCH_FIELDS.includes("final_grant_date"))
})

test("a source change after subscription baseline is not absorbed by the next scheduled poll", () => {
  const atSubscriptionCreation = sourceState({
    status: "FURTHER INFORMATION RECEIVED",
    further_information_requested_date: "2026-06-01",
    further_information_received_date: "2026-07-01",
  })
  const beforeScheduledPoll = sourceState({
    ...atSubscriptionCreation,
    status: "DECISION MADE",
    decision_date: "2026-08-22",
    decision_text: "Refused",
  })

  assert.deepEqual(changedWatchFields(atSubscriptionCreation, beforeScheduledPoll), [
    "status",
    "decision_date",
    "decision_text",
  ])
  assert.deepEqual(applicationUpdates(atSubscriptionCreation, beforeScheduledPoll, [
    "status",
    "decision_date",
    "decision_text",
  ]), {
    status: "DECISION MADE",
    decision_date: "2026-08-22",
    decision_text: "Refused",
  })
})

test("existing watch states baseline only newly introduced fields without hiding existing-field changes", () => {
  const previousVersionOne = {
    further_information_requested_date: "2026-06-01",
    further_information_received_date: null,
  }
  const official = sourceState({
    status: "DECISION MADE",
    decision_date: "2026-08-20",
    decision_text: "Grant Permission",
    further_information_requested_date: "2026-06-01",
    further_information_received_date: "2026-07-01",
  })
  const { comparisonState, baselineOnlyFields } = upgradeWatchComparisonState(
    previousVersionOne,
    official,
    1
  )

  assert.deepEqual(baselineOnlyFields, ["status", "decision_date", "decision_text"])
  assert.deepEqual(changedWatchFields(comparisonState, official), ["further_information_received_date"])
})

test("subscription creation requests an immediate no-email baseline with scheduled retry", async () => {
  const [action, migration, watcher] = await Promise.all([
    source("app/my-alerts/actions.ts"),
    source("supabase/migrations/20260822144205_harden_planning_alert_watch_initialization.sql"),
    source("lib/planning-alert-watch.mjs"),
  ])

  assert.match(action, /after\(async \(\) =>[\s\S]*initializePlanningAlertWatch\(application_id\)/)
  assert.match(migration, /create trigger ensure_planning_alert_watch[\s\S]*after insert or update of enabled/)
  assert.match(migration, /initialization_requested_at/)
  const baseline = watcher.match(/if \(!watch\?\.initialized_at\) \{[\s\S]*?return \{ outcome: "initialized"/)?.[0] || ""
  assert.match(baseline, /state/)
  assert.doesNotMatch(baseline, /recordObservedChange|planning_alert_observed_changes/)
})

test("watch updates stay HOT and use the separate durable exact-path queue", async () => {
  const [watcher, worker, workflow, migration] = await Promise.all([
    source("lib/planning-alert-watch.mjs"),
    source("lib/planning-revalidation.ts"),
    source(".github/workflows/planning-alert-watch.yml"),
    source("supabase/migrations/20260822144205_harden_planning_alert_watch_initialization.sql"),
  ])

  const updateCanonical = watcher.match(/async function updateCanonical[\s\S]*?\n  \}/)?.[0] || ""
  assert.doesNotMatch(updateCanonical, /revalidation_pending/)
  assert.match(watcher, /from\("planning_revalidation_queue"\)\.upsert/)
  assert.match(worker, /from\("planning_revalidation_queue"\)/)
  assert.match(worker, /invalidatePath\(planningApplicationPath\(authority, related\.reference\)\)/)
  assert.match(workflow, /Revalidate changed Planning detail pages/)
  assert.match(migration, /create table public\.planning_revalidation_queue/)
})

test("email eligibility remains watch-only after terminal lifecycle expansion", async () => {
  const migration = await source("supabase/migrations/20260822130000_watch_only_planning_alerts.sql")
  const watcher = await source("lib/planning-alert-watch.mjs")

  assert.match(migration, /from public\.planning_alert_observed_changes c/)
  assert.doesNotMatch(migration, /from public\.planning_application_events event/)
  assert.match(watcher, /from\("planning_alert_observed_changes"\)\.upsert/)
})
