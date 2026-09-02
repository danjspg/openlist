import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"
import { shouldShowPlanningAlertControls } from "@/lib/planning-alert-visibility"

async function source(path: string) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8")
}

test("planning alert canary hides controls for signed-out or unresolved users when public rollout is off", () => {
  assert.equal(shouldShowPlanningAlertControls(false, false, true), false)
  assert.equal(shouldShowPlanningAlertControls(false, false, false), false)
  assert.equal(shouldShowPlanningAlertControls(false, true, false), false)
})

test("planning alert canary shows controls for resolved signed-in users and public rollout", () => {
  assert.equal(shouldShowPlanningAlertControls(false, true, true), true)
  assert.equal(shouldShowPlanningAlertControls(true, false, false), true)
  assert.equal(shouldShowPlanningAlertControls(true, true, true), true)
})

test("planning alert migration protects one subscription per user and application", async () => {
  const migration = await source("supabase/migrations/20260821085929_planning_alert_subscriptions.sql")

  assert.match(migration, /references auth\.users\(id\) on delete cascade/)
  assert.match(migration, /references public\.planning_applications\(id\) on delete cascade/)
  assert.match(migration, /unique \(user_id, application_id\)/)
  assert.match(migration, /where enabled/)
})

test("planning alert migration grants only authenticated owners and service role", async () => {
  const migration = await source("supabase/migrations/20260821085929_planning_alert_subscriptions.sql")

  assert.match(migration, /revoke all on table public\.planning_alert_subscriptions from anon, authenticated/)
  assert.match(migration, /grant select, insert, update, delete on table public\.planning_alert_subscriptions to authenticated/)
  assert.match(migration, /grant select, insert, update, delete on table public\.planning_alert_subscriptions to service_role/)
  assert.match(migration, /for select[\s\S]*to authenticated[\s\S]*\(select auth\.uid\(\)\) = user_id/)
  assert.match(migration, /for insert[\s\S]*to authenticated[\s\S]*with check \(\(select auth\.uid\(\)\) = user_id\)/)
  assert.match(migration, /for update[\s\S]*using \(\(select auth\.uid\(\)\) = user_id\)[\s\S]*with check \(\(select auth\.uid\(\)\) = user_id\)/)
  assert.match(migration, /for delete[\s\S]*to authenticated[\s\S]*using \(\(select auth\.uid\(\)\) = user_id\)/)
})

test("planning alert signup snapshots preserve point-in-time application state", async () => {
  const migration = await source("supabase/migrations/20260902213000_planning_alert_signup_snapshots.sql")

  assert.match(migration, /create table public\.planning_alert_signup_snapshots/)
  assert.match(migration, /subscription_id uuid not null/)
  assert.match(migration, /user_id uuid references auth\.users\(id\) on delete set null/)
  assert.match(migration, /application_id uuid references public\.planning_applications\(id\) on delete set null/)
  assert.match(migration, /application_reference text not null/)
  assert.match(migration, /status_at_signup text not null/)
  assert.match(migration, /raw_status_at_signup text/)
  assert.match(migration, /signed_up_at timestamptz not null default now\(\)/)
  assert.match(migration, /coalesce\(a\.normalized_status, 'unknown'\)/)
  assert.match(migration, /a\.status/)
  assert.match(migration, /after insert or update of enabled on public\.planning_alert_subscriptions/)
  assert.match(migration, /should_capture := new\.enabled and not old\.enabled/)
  assert.match(migration, /revoke all on table public\.planning_alert_signup_snapshots from public, anon, authenticated/)
  assert.match(migration, /group by status_at_signup/)
})

test("planning alert actions retain explicit intent and avoid duplicate subscriptions", async () => {
  const [actions, cta] = await Promise.all([
    source("app/my-alerts/actions.ts"),
    source("components/PlanningAlertActions.tsx"),
  ])

  assert.match(actions, /\.upsert\([\s\S]*onConflict: "user_id,application_id"/)
  assert.match(actions, /user_id: currentUser\.id, application_id, enabled: true/)
  assert.match(actions, /\.eq\("user_id", currentUser\.id\)/)
  assert.match(cta, /redirectTo=\$\{encodeURIComponent\(`\$\{returnPath\}\?alert=1`\)\}/)
  assert.match(cta, /fetch\(`\/api\/planning-alerts\/\$\{applicationId\}`/)
  assert.match(cta, /action=\{handleEnable\}/)
  assert.match(cta, /action=\{handleDisable\}/)
})

test("planning detail presents a primary alert action and a compact subscribed state", async () => {
  const [page, layout, cta, myAlerts] = await Promise.all([
    source("app/planning/[authority]/[reference]/page.tsx"),
    source("app/planning/[authority]/[reference]/layout.tsx"),
    source("components/PlanningAlertActions.tsx"),
    source("app/my-alerts/page.tsx"),
  ])

  assert.match(page, /<PlanningAlertActions/)
  assert.match(page, /<PlanningTimeline/)
  assert.match(page, /data-planning-lifecycle-card/)
  assert.match(page, /data-planning-detail-header/)
  assert.match(page, /data-planning-lifecycle-status/)
  assert.match(page, /data-planning-lifecycle-decision/)
  assert.match(page, /data-planning-lifecycle-decision-item/)
  assert.match(layout, /\[data-planning-lifecycle-actions\]/)
  assert.doesNotMatch(layout, /\> div/)
  assert.match(cta, /Get email updates/)
  assert.match(cta, /Email updates on/)
  assert.match(cta, /Council record/)
  assert.match(cta, /Stop email updates/)
  assert.match(cta, /Manage my alerts/)
  assert.match(cta, /data-planning-lifecycle-actions/)
  assert.match(cta, /border border-emerald-700 bg-emerald-700/)
  assert.doesNotMatch(cta, /bg-gradient-to-b/)
  assert.match(cta, /border border-stone-300 bg-white/)
  assert.match(cta, /sm:flex-row sm:flex-nowrap/)
  assert.doesNotMatch(cta, /We&apos;ll email you about meaningful changes to this application/)
  assert.match(myAlerts, /planning_applications: AlertApplication \| AlertApplication\[\] \| null/)
  assert.match(myAlerts, /Array\.isArray\(alert\.planning_applications\)/)
  assert.match(myAlerts, /Planning applications you&apos;re following/)
  assert.doesNotMatch(myAlerts, />OpenList<\/p>/)
  assert.match(myAlerts, /normalized_status,decision_due_date/)
  assert.match(myAlerts, /planning_application_events/)
  assert.match(myAlerts, /No changes since this alert was created/)
  assert.match(myAlerts, /Current status/)
  assert.match(myAlerts, /Recent activity/)
  assert.match(myAlerts, /line-clamp-2/)
  assert.match(myAlerts, /Email updates on/)
  assert.match(myAlerts, /bg-emerald-700/)
  assert.match(myAlerts, /Stop updates/)
  assert.match(myAlerts, /View application/)
  assert.match(myAlerts, /Remove alert/)
})
