import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

import {
  PLANNING_ALERT_EVENT_TYPES,
  PLANNING_ALERT_MAX_ATTEMPTS,
  PLANNING_ALERT_STATUS_DESTINATIONS,
  planningAlertDeliveryIsEnabled,
  planningAlertEventTitle,
} from "../lib/planning-alert-delivery-rules"
import { renderPlanningAlertEmail } from "../lib/planning-alert-email"
import {
  createPlanningAlertUnsubscribeToken,
  verifyPlanningAlertUnsubscribeToken,
} from "../lib/planning-alert-unsubscribe"

async function source(path: string) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8")
}

const subscriptionId = "11111111-1111-4111-8111-111111111111"

test("delivery migration queues only observed post-subscription events exactly once", async () => {
  const migration = await source("supabase/migrations/20260821095315_planning_alert_deliveries.sql")

  assert.match(migration, /unique \(subscription_id, event_id\)/)
  assert.match(migration, /event\.provenance = 'observed'/)
  assert.match(migration, /event\.detected_at >= subscription\.created_at/)
  assert.match(migration, /subscription\.enabled = true/)
  assert.match(migration, /on conflict \(subscription_id, event_id\) do nothing/)
  assert.match(migration, /order by event\.detected_at, event\.id, subscription\.id[\s\S]*limit bounded_limit/)
  assert.match(migration, /planning_application_events_alert_queue_idx[\s\S]*\(application_id, detected_at, id\)[\s\S]*where provenance = 'observed'/)

  assert.deepEqual(PLANNING_ALERT_EVENT_TYPES, [
    "further_information_requested",
    "further_information_received",
    "decision_made",
    "final_grant",
    "appeal_lodged",
    "appeal_decided",
    "withdrawn",
    "decision_changed",
    "decision_due_changed",
  ])
  for (const excluded of [
    "application_received",
    "application_validated",
    "decision_notice_issued",
    "appeal_notification",
    "source_date_corrected",
    "other",
  ]) {
    assert.equal(PLANNING_ALERT_EVENT_TYPES.includes(excluded as never), false)
  }
})

test("status delivery destinations are explicit and specific events suppress generic duplicates", async () => {
  const migration = await source("supabase/migrations/20260821095315_planning_alert_deliveries.sql")

  assert.deepEqual(PLANNING_ALERT_STATUS_DESTINATIONS, [
    "under_assessment",
    "further_information_requested",
    "further_information_received",
    "decision_made",
    "final_grant",
    "appealed",
    "appeal_decided",
    "withdrawn",
    "invalid",
    "finalised",
  ])
  assert.match(migration, /event\.event_type = 'status_changed'/)
  assert.match(migration, /specific\.detected_at = event\.detected_at/)
  assert.match(migration, /specific\.source_field is distinct from 'status'/)
  assert.match(migration, /when 'appealed' then 'appeal_lodged'/)
})

test("delivery claims are atomic, bounded, retryable, and private", async () => {
  const migration = await source("supabase/migrations/20260821095315_planning_alert_deliveries.sql")

  assert.equal(PLANNING_ALERT_MAX_ATTEMPTS, 5)
  assert.match(migration, /status in \('queued', 'sending', 'sent', 'failed'\)/)
  assert.match(migration, /attempt_count between 0 and 5/)
  assert.match(migration, /for update of delivery skip locked/)
  assert.match(migration, /delivery\.attempt_count \+ 1/)
  assert.match(migration, /delivery\.claimed_at <= now\(\) - stale_after/)
  assert.match(migration, /make_interval\(mins => least\(60, 5 \* \(2 \^/)
  assert.match(migration, /alter table public\.planning_alert_deliveries enable row level security/)
  assert.match(migration, /revoke all on table public\.planning_alert_deliveries from anon, authenticated/)
  assert.match(migration, /grant select, insert, update, delete on table public\.planning_alert_deliveries to service_role/)
  assert.match(migration, /revoke execute on function public\.openlist_claim_planning_alert_deliveries[\s\S]*from public, anon, authenticated/)
})

test("unsubscribe tokens are signed, tamper-resistant, and do not require login", async () => {
  const previous = process.env.PLANNING_ALERT_UNSUBSCRIBE_SECRET
  process.env.PLANNING_ALERT_UNSUBSCRIBE_SECRET = "test-only-secret-with-at-least-thirty-two-characters"
  try {
    const token = createPlanningAlertUnsubscribeToken(subscriptionId)
    assert.equal(verifyPlanningAlertUnsubscribeToken(token), subscriptionId)
    assert.equal(verifyPlanningAlertUnsubscribeToken(`${token}x`), null)
    assert.equal(verifyPlanningAlertUnsubscribeToken("v1.not-a-uuid.invalid"), null)
  } finally {
    if (previous === undefined) delete process.env.PLANNING_ALERT_UNSUBSCRIBE_SECRET
    else process.env.PLANNING_ALERT_UNSUBSCRIBE_SECRET = previous
  }

  const [page, action] = await Promise.all([
    source("app/planning-alerts/unsubscribe/page.tsx"),
    source("app/planning-alerts/unsubscribe/actions.ts"),
  ])
  assert.match(page, /Stop updates for this application\?/)
  assert.doesNotMatch(action, /requireUser|getCurrentUser/)
  assert.match(action, /verifyPlanningAlertUnsubscribeToken/)
  assert.match(action, /\.update\(\{ enabled: false \}\)/)
})

test("one event renders one transactional email with deterministic idempotency", () => {
  const previousSecret = process.env.PLANNING_ALERT_UNSUBSCRIBE_SECRET
  const previousSiteUrl = process.env.NEXT_PUBLIC_SITE_URL
  process.env.PLANNING_ALERT_UNSUBSCRIBE_SECRET = "test-only-secret-with-at-least-thirty-two-characters"
  process.env.NEXT_PUBLIC_SITE_URL = "https://www.openlist.ie"
  try {
    const email = renderPlanningAlertEmail({
      delivery_id: "22222222-2222-4222-8222-222222222222",
      subscription_id: subscriptionId,
      event_type: "decision_made",
      event_date: "2026-08-21",
      event_label: "Decision: Grant permission",
      old_value: null,
      new_value: "Grant permission",
      local_authority_code: "CORKCOCO",
      application_reference: "26/1595",
      proposal: "A test proposal",
      location: "A test location",
    })
    assert.equal(email.subject, "A decision has been recorded · A test location")
    assert.doesNotMatch(email.subject, /26\/1595/)
    assert.match(email.html, /Decision: Grant permission/)
    assert.match(email.html, /Stop updates for this application/)
    assert.match(email.text, /not a marketing email/)
    assert.match(email.unsubscribeUrl, /\/planning-alerts\/unsubscribe\?token=/)
    assert.doesNotMatch(email.html, /<img|tracking/i)
    const authoritativeSourceDisclaimer =
      "OpenList helps you follow this application. The relevant local authority remains the authoritative source for the planning record."
    assert.ok(email.html.includes(authoritativeSourceDisclaimer))
    assert.ok(email.text.includes(authoritativeSourceDisclaimer))
    assert.equal(planningAlertEventTitle("decision_made", "ignored"), "A decision has been recorded")
  } finally {
    if (previousSecret === undefined) delete process.env.PLANNING_ALERT_UNSUBSCRIBE_SECRET
    else process.env.PLANNING_ALERT_UNSUBSCRIBE_SECRET = previousSecret
    if (previousSiteUrl === undefined) delete process.env.NEXT_PUBLIC_SITE_URL
    else process.env.NEXT_PUBLIC_SITE_URL = previousSiteUrl
  }
})

test("planning alert subjects use the existing location, omit duplicate county suffixes, and stay compact", () => {
  const previousSecret = process.env.PLANNING_ALERT_UNSUBSCRIBE_SECRET
  const previousSiteUrl = process.env.NEXT_PUBLIC_SITE_URL
  process.env.PLANNING_ALERT_UNSUBSCRIBE_SECRET = "test-only-secret-with-at-least-thirty-two-characters"
  process.env.NEXT_PUBLIC_SITE_URL = "https://www.openlist.ie"
  try {
    const base = {
      delivery_id: "33333333-3333-4333-8333-333333333333",
      subscription_id: subscriptionId,
      event_type: "further_information_requested",
      event_date: "2026-08-21",
      event_label: "Further information requested",
      old_value: null,
      new_value: null,
      local_authority_code: "LOUTH",
      application_reference: "2660436",
      proposal: null,
    } as const

    assert.equal(
      renderPlanningAlertEmail({ ...base, location: "Cuan Mo Chroi, Dundalk, Co. Louth" }).subject,
      "Further information requested · Cuan Mo Chroi, Dundalk"
    )
    assert.equal(
      renderPlanningAlertEmail({ ...base, location: null }).subject,
      "Further information requested"
    )

    const longSubject = renderPlanningAlertEmail({
      ...base,
      location: "A very long planning location name that should be shortened for a useful mobile subject line",
    }).subject
    assert.ok(longSubject.length <= 78)
    assert.match(longSubject, /…$/)
  } finally {
    if (previousSecret === undefined) delete process.env.PLANNING_ALERT_UNSUBSCRIBE_SECRET
    else process.env.PLANNING_ALERT_UNSUBSCRIBE_SECRET = previousSecret
    if (previousSiteUrl === undefined) delete process.env.NEXT_PUBLIC_SITE_URL
    else process.env.NEXT_PUBLIC_SITE_URL = previousSiteUrl
  }
})

test("scheduled endpoint remains gated while the public feature is off", async () => {
  const [workflow, endpoint, cta] = await Promise.all([
    source(".github/workflows/planning-alert-delivery.yml"),
    source("app/api/internal/planning-alert-delivery/route.ts"),
    source("components/PlanningAlertActions.tsx"),
  ])
  assert.match(workflow, /cron: "\*\/15 \* \* \* \*"/)
  assert.match(workflow, /PLANNING_ALERT_DELIVERY_SECRET/)
  assert.match(endpoint, /planningAlertDeliveryIsEnabled/)
  assert.match(cta, /shouldShowPlanningAlertControls\(publicAlertsEnabled, isAuthenticated, isResolved\)/)

  const previous = process.env.PLANNING_ALERT_DELIVERY_ENABLED
  delete process.env.PLANNING_ALERT_DELIVERY_ENABLED
  assert.equal(planningAlertDeliveryIsEnabled(), false)
  process.env.PLANNING_ALERT_DELIVERY_ENABLED = "true"
  assert.equal(planningAlertDeliveryIsEnabled(), true)
  if (previous === undefined) delete process.env.PLANNING_ALERT_DELIVERY_ENABLED
  else process.env.PLANNING_ALERT_DELIVERY_ENABLED = previous
})
