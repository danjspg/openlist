import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

async function source(path: string) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8")
}

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

test("planning detail presents a primary alert action and a secondary council action", async () => {
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
  assert.match(cta, /data-planning-lifecycle-actions/)
  assert.match(cta, /bg-gradient-to-b from-emerald-600 to-emerald-700/)
  assert.match(cta, /View official council application/)
  assert.match(cta, /border border-stone-300 bg-white/)
  assert.match(cta, /min-h-11 w-full/)
  assert.match(cta, /grid gap-3 sm:grid-cols-2/)
  assert.match(myAlerts, /planning_applications: AlertApplication \| AlertApplication\[\] \| null/)
  assert.match(myAlerts, /Array\.isArray\(alert\.planning_applications\)/)
  assert.match(myAlerts, /Stop updates/)
  assert.match(myAlerts, /View application/)
})
