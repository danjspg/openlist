import { createClient } from "@supabase/supabase-js"

import { parseCorkCouncilDate } from "../lib/cork-planning-source.mjs"
import { EPLAN_AUTHORITIES, fetchEplanApplication } from "../lib/eplan-planning-source.mjs"
import { parseNationalArcgisDate } from "../lib/national-planning-source.mjs"
import {
  AUTHORITIES,
  mapApplication as mapNationalApplication,
} from "./ingest-national-planning-applications.mjs"

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!supabaseUrl || !serviceRoleKey) {
  throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY")
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
})

const delay = Math.max(0, Number(process.env.PLANNING_ALERT_WATCH_DELAY_MS || 750))
const terminal = new Set(["final_grant", "appeal_decided", "finalised", "invalid", "withdrawn"])
const corkAuthorityCode = "CORKCOCO"
const corkDetailUrl = "https://planningapi.agileapplications.ie/api/application"
const nationalFeatureUrl =
  "https://services.arcgis.com/NzlPQPKn5QF9v2US/ArcGIS/rest/services/IrishPlanningApplications/FeatureServer/0/query"
const fields = [
  "further_information_requested_date",
  "further_information_received_date",
  "withdrawal_date",
  "appeal_lodged_date",
  "appeal_decision_date",
  "decision_due_date",
]
const eventType = {
  further_information_requested_date: "further_information_requested",
  further_information_received_date: "further_information_received",
  withdrawal_date: "withdrawn",
  appeal_lodged_date: "appeal_lodged",
  appeal_decision_date: "appeal_decided",
  decision_due_date: "decision_due_changed",
}
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

function valueOrNull(value) {
  return value || null
}

function sourceState(source) {
  return Object.fromEntries(fields.map((field) => [field, valueOrNull(source[field])]))
}

async function fetchJson(url, label, headers = {}) {
  let lastError = null
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: { "User-Agent": "OpenList Planning alert watcher", ...headers },
      })
      if (response.status === 404) return { ok: false, reason: "not_found" }
      if (response.ok) {
        const data = await response.json()
        if (data.error) return { ok: false, reason: "source_error", error: data.error.message || JSON.stringify(data.error) }
        return { ok: true, data }
      }
      lastError = new Error(`${label}: HTTP ${response.status}`)
      if (![408, 425, 429, 500, 502, 503, 504].includes(response.status)) break
    } catch (error) {
      lastError = error
    }
    await sleep(attempt * 1000)
  }
  return { ok: false, reason: "fetch_error", error: String(lastError) }
}

async function fetchCorkApplication(app) {
  if (!Number.isInteger(Number(app.source_application_id))) {
    return { ok: false, reason: "missing_source_application_id" }
  }
  const result = await fetchJson(`${corkDetailUrl}/${Number(app.source_application_id)}`, app.reference, {
    "x-client": corkAuthorityCode,
    "x-product": "CITIZENPORTAL",
    "x-service": "PA",
  })
  if (!result.ok) return result
  const detail = result.data || {}
  return {
    ok: true,
    decision_due_date: Object.hasOwn(detail, "decisionDueDate")
      ? parseCorkCouncilDate(detail.decisionDueDate)
      : app.decision_due_date,
    further_information_requested_date: Object.hasOwn(detail, "furtherInfoRequestedDate")
      ? parseCorkCouncilDate(detail.furtherInfoRequestedDate)
      : app.further_information_requested_date,
    further_information_received_date: Object.hasOwn(detail, "furtherInfoReceivedDate")
      ? parseCorkCouncilDate(detail.furtherInfoReceivedDate)
      : app.further_information_received_date,
    withdrawal_date: Object.hasOwn(detail, "withdrawnDate")
      ? parseCorkCouncilDate(detail.withdrawnDate)
      : app.withdrawal_date,
    appeal_lodged_date: Object.hasOwn(detail, "appealLodgedDate")
      ? parseCorkCouncilDate(detail.appealLodgedDate)
      : app.appeal_lodged_date,
    appeal_decision_date: Object.hasOwn(detail, "appealDecisionDate")
      ? parseCorkCouncilDate(detail.appealDecisionDate)
      : app.appeal_decision_date,
  }
}

async function fetchNationalApplication(app) {
  const authority = AUTHORITIES.find((candidate) => candidate.code === app.local_authority_code)
  const sourceId = Number(app.source_application_id)
  if (!authority || !Number.isInteger(sourceId)) {
    return { ok: false, reason: "unsupported_authority" }
  }
  const params = new URLSearchParams({
    where: `OBJECTID = ${sourceId}`,
    outFields: "*",
    returnGeometry: "false",
    resultRecordCount: "1",
    f: "json",
  })
  const result = await fetchJson(`${nationalFeatureUrl}?${params.toString()}`, app.reference)
  if (!result.ok) return result
  const row = result.data?.features?.[0]?.attributes
  if (!row) return { ok: false, reason: "not_found" }
  const mapped = mapNationalApplication(row, authority, { storePayload: false })
  if (!mapped || mapped.reference !== app.reference) {
    return { ok: false, reason: "reference_mismatch" }
  }
  return {
    ok: true,
    ...sourceState(mapped),
    expiry_date: parseNationalArcgisDate(row.ExpiryDate),
  }
}

async function fetchSourceState(app) {
  if (EPLAN_AUTHORITIES[app.local_authority_code]) {
    const source = await fetchEplanApplication(app.local_authority_code, app.reference)
    return source.ok
      ? { strategy: "eplan", source: { ok: true, ...sourceState(source), expiry_date: source.expiry_date } }
      : { strategy: "eplan", source }
  }
  if (app.local_authority_code === corkAuthorityCode) {
    return { strategy: "cork_official_api", source: await fetchCorkApplication(app) }
  }
  return { strategy: "national_arcgis_exact", source: await fetchNationalApplication(app) }
}

async function loadWatchedApplications() {
  const { data, error } = await supabase
    .from("planning_alert_subscriptions")
    .select(`
      application_id,
      planning_applications(
        id,reference,local_authority_code,source_application_id,normalized_status,
        further_information_requested_date,further_information_received_date,
        withdrawal_date,appeal_lodged_date,appeal_decision_date,decision_due_date
      )
    `)
    .eq("enabled", true)
  if (error) throw error
  return [...new Map((data || []).map((row) => [row.application_id, row.planning_applications])).values()]
    .filter(Boolean)
}

async function upsertWatchFailure(app, strategy, now, source) {
  await supabase.from("planning_alert_watch_state").upsert({
    application_id: app.id,
    last_checked_at: now,
    source_strategy: strategy,
    last_error: source.reason || source.error || "source_failure",
    updated_at: now,
  })
}

async function recordObservedChange(app, field, value, now, strategy) {
  let query = supabase
    .from("planning_application_events")
    .select("id")
    .eq("application_id", app.id)
    .eq("event_type", eventType[field])
    .order("detected_at", { ascending: false })
    .limit(1)
  query = field === "decision_due_date" ? query.eq("new_value", value) : query.eq("event_date", value)
  const { data: event, error } = await query.maybeSingle()
  if (error) throw error
  if (!event) return false
  const { error: changeError } = await supabase.from("planning_alert_observed_changes").upsert(
    {
      application_id: app.id,
      event_id: event.id,
      observed_at: now,
      source: strategy,
      source_field: field,
      change_key: `${field}:${value}`,
    },
    { onConflict: "application_id,change_key" }
  )
  if (changeError) throw changeError
  return true
}

async function updateCanonical(app, updates, now) {
  if (Object.keys(updates).length === 0) return
  const { error } = await supabase
    .from("planning_applications")
    .update({ ...updates, updated_at: now, revalidation_pending: true })
    .eq("id", app.id)
  if (error) throw error
}

async function main() {
  const applications = await loadWatchedApplications()
  const report = {
    selected: applications.length,
    initialized: 0,
    checked: 0,
    changed: 0,
    failures: 0,
    skippedTerminal: 0,
  }

  for (const app of applications) {
    const now = new Date().toISOString()
    const { data: watch, error: watchError } = await supabase
      .from("planning_alert_watch_state")
      .select("initialized_at,state")
      .eq("application_id", app.id)
      .maybeSingle()
    if (watchError) throw watchError

    const { strategy, source } = await fetchSourceState(app)
    if (!source.ok) {
      report.failures += 1
      await upsertWatchFailure(app, strategy, now, source)
      if (delay > 0) await sleep(delay)
      continue
    }

    const state = sourceState(source)
    if (!watch?.initialized_at) {
      const baselineUpdates = Object.fromEntries(
        fields.filter((field) => !app[field] && state[field]).map((field) => [field, state[field]])
      )
      await updateCanonical(app, baselineUpdates, now)
      const { error } = await supabase.from("planning_alert_watch_state").upsert({
        application_id: app.id,
        initialized_at: now,
        last_checked_at: now,
        last_successful_check_at: now,
        source_strategy: strategy,
        state,
        last_error: null,
        updated_at: now,
      })
      if (error) throw error
      report.initialized += 1
      if (delay > 0) await sleep(delay)
      continue
    }

    if (terminal.has(app.normalized_status)) {
      report.skippedTerminal += 1
      await supabase.from("planning_alert_watch_state").upsert({
        application_id: app.id,
        last_checked_at: now,
        last_successful_check_at: now,
        source_strategy: strategy,
        state,
        last_error: null,
        updated_at: now,
      })
      if (delay > 0) await sleep(delay)
      continue
    }

    report.checked += 1
    const previous = watch.state || {}
    const changedFields = fields.filter((field) => state[field] && state[field] !== previous[field])
    const updates = Object.fromEntries(
      changedFields.filter((field) => app[field] !== state[field]).map((field) => [field, state[field]])
    )
    await updateCanonical(app, updates, now)

    for (const field of changedFields) {
      if (await recordObservedChange(app, field, state[field], now, strategy)) {
        report.changed += 1
      }
    }

    const { error } = await supabase.from("planning_alert_watch_state").upsert({
      application_id: app.id,
      last_checked_at: now,
      last_successful_check_at: now,
      source_strategy: strategy,
      state,
      last_error: null,
      updated_at: now,
    })
    if (error) throw error
    if (delay > 0) await sleep(delay)
  }

  console.log(JSON.stringify(report))
}

await main()
