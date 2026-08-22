import { createClient } from "@supabase/supabase-js"
import { EPLAN_AUTHORITIES, fetchEplanApplication } from "../lib/eplan-planning-source.mjs"

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
const delay = Math.max(500, Number(process.env.PLANNING_ALERT_WATCH_DELAY_MS || 750))
const terminal = new Set(["finalised", "invalid", "withdrawn"])
const fields = ["further_information_requested_date", "further_information_received_date", "withdrawal_date", "appeal_lodged_date", "expiry_date"]
const eventType = { further_information_requested_date: "further_information_requested", further_information_received_date: "further_information_received", withdrawal_date: "withdrawn", appeal_lodged_date: "appeal_lodged", expiry_date: "expiry" }
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

const { data: subscriptions, error: subscriptionError } = await supabase
  .from("planning_alert_subscriptions")
  .select("application_id,planning_applications(id,reference,local_authority_code,normalized_status,further_information_requested_date,further_information_received_date,withdrawal_date,appeal_lodged_date,expiry_date)")
  .eq("enabled", true)
if (subscriptionError) throw subscriptionError
const applications = [...new Map((subscriptions || []).map(s => [s.application_id, s.planning_applications])).values()]
const report = { selected: applications.length, initialized: 0, checked: 0, changed: 0, failures: 0, unsupported: 0 }

for (const app of applications) {
  if (!app) continue
  const now = new Date().toISOString()
  const { data: watch } = await supabase.from("planning_alert_watch_state").select("initialized_at,state").eq("application_id", app.id).maybeSingle()
  // ePlan is the richer official detail register for its verified authorities.
  // Cork and remaining authorities are still deliberately watched through the
  // canonical state refreshed from their existing official integrations; they
  // never silently leave the monitoring cohort just because ePlan is absent.
  const strategy = EPLAN_AUTHORITIES[app.local_authority_code] ? "eplan" : "canonical_official_refresh"
  let source = null
  if (strategy === "eplan") {
    source = await fetchEplanApplication(app.local_authority_code, app.reference)
    if (!source.ok) {
      report.failures += 1
      await supabase.from("planning_alert_watch_state").upsert({ application_id: app.id, last_checked_at: now, last_error: source.reason, source_strategy: strategy })
      await sleep(delay); continue
    }
  }
  const state = Object.fromEntries(fields.map(field => [field, source?.[field] || app[field] || null]))
  if (!watch?.initialized_at) {
    const update = Object.fromEntries(fields.filter(field => !app[field] && state[field]).map(field => [field, state[field]]))
    if (Object.keys(update).length) await supabase.from("planning_applications").update(update).eq("id", app.id)
    await supabase.from("planning_alert_watch_state").upsert({ application_id: app.id, initialized_at: now, last_checked_at: now, last_successful_check_at: now, source_strategy: strategy, state, last_error: null, updated_at: now })
    report.initialized += 1
    await sleep(delay); continue
  }
  if (terminal.has(app.normalized_status)) continue
  report.checked += 1
  const previous = watch.state || {}
  for (const field of fields) {
    if (!state[field] || state[field] === previous[field]) continue
    if (!app[field]) await supabase.from("planning_applications").update({ [field]: state[field] }).eq("id", app.id)
    const { data: event } = await supabase.from("planning_application_events").select("id").eq("application_id", app.id).eq("event_type", eventType[field]).eq("event_date", state[field]).order("detected_at", { ascending: false }).limit(1).maybeSingle()
    if (event) {
      await supabase.from("planning_alert_observed_changes").upsert({ application_id: app.id, event_id: event.id, observed_at: now, source: "eplan", source_field: field, change_key: `${field}:${state[field]}` }, { onConflict: "application_id,change_key" })
      report.changed += 1
    }
  }
  await supabase.from("planning_alert_watch_state").upsert({ application_id: app.id, last_checked_at: now, last_successful_check_at: now, source_strategy: strategy, state, last_error: null, updated_at: now })
  await sleep(delay)
}
console.log(JSON.stringify(report))
