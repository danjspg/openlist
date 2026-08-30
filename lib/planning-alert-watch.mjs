import { parseCorkCouncilDate } from "./cork-planning-source.mjs"
import {
  corkAgileApplicationConfig,
  corkAgileSourceApplicationId,
} from "./cork-agile-authorities.mjs"
import { EPLAN_AUTHORITIES, fetchEplanApplication } from "./eplan-planning-source.mjs"
import { cleanNationalPlanningText, parseNationalArcgisDate } from "./national-planning-source.mjs"
import { normalisePlanningStatus, planningStatusKey } from "./planning-status.mjs"

const CORK_DETAIL_URL = "https://planningapi.agileapplications.ie/api/application"
const NATIONAL_FEATURE_URL =
  "https://services.arcgis.com/NzlPQPKn5QF9v2US/ArcGIS/rest/services/IrishPlanningApplications/FeatureServer/0/query"
const WATCH_STATE_VERSION = 2
const VERSION_TWO_FIELDS = new Set(["status", "decision_date", "decision_text", "final_grant_date"])

const WATCH_FIELDS = [
  "status",
  "further_information_requested_date",
  "further_information_received_date",
  "decision_due_date",
  "decision_date",
  "decision_text",
  "final_grant_date",
  "withdrawal_date",
  "appeal_lodged_date",
  "appeal_decision_date",
]

const EVENT_TYPES = {
  further_information_requested_date: ["further_information_requested"],
  further_information_received_date: ["further_information_received"],
  decision_due_date: ["decision_due_changed"],
  decision_date: ["decision_made"],
  decision_text: ["decision_changed"],
  final_grant_date: ["final_grant"],
  withdrawal_date: ["withdrawn"],
  appeal_lodged_date: ["appeal_lodged"],
  appeal_decision_date: ["appeal_decided"],
  status: ["status_changed", "withdrawn"],
}

const DATE_EVENT_FIELDS = new Set([
  "further_information_requested_date",
  "further_information_received_date",
  "decision_date",
  "final_grant_date",
  "withdrawal_date",
  "appeal_lodged_date",
  "appeal_decision_date",
])

const UNAVAILABLE_TEXT = new Set(["-", "n/a", "na", "none", "null", "undefined", "unknown"])

function cleanText(value) {
  const text = String(value ?? "").replace(/\s+/g, " ").trim()
  return !text || UNAVAILABLE_TEXT.has(text.toLowerCase()) ? null : text
}

function stateValue(field, value) {
  return field === "status" || field === "decision_text" ? cleanText(value) : value || null
}

function sourceState(source) {
  return Object.fromEntries(WATCH_FIELDS.map((field) => [field, stateValue(field, source[field])]))
}

function changedWatchFields(previous, current) {
  return WATCH_FIELDS.filter(
    (field) => current[field] !== null && current[field] !== undefined && current[field] !== previous?.[field]
  )
}

/**
 * @param {Record<string, any>} app
 * @param {Record<string, any>} state
 * @param {string[]} changedFields
 * @param {{strategy?: string | null, observedAt?: string | null}} [options]
 */
function applicationUpdates(app, state, changedFields, { strategy = null, observedAt = null } = {}) {
  /** @type {Record<string, unknown>} */
  const updates = Object.fromEntries(
    changedFields.filter((field) => app[field] !== state[field]).map((field) => [field, state[field]])
  )

  // ePlan is used only for the small watched-application cohort, but its
  // application-detail status can be fresher than the national ArcGIS feed.
  // Mark that status with provenance even when the canonical value already
  // matches, so later broad ingestion cannot silently regress it.
  if (strategy === "eplan" && changedFields.includes("status") && state.status) {
    updates.status_source = "eplan"
    updates.status_observed_at = observedAt || new Date().toISOString()
  }

  return updates
}

function upgradeWatchComparisonState(previous, current, stateVersion = 1) {
  const comparisonState = { ...(previous || {}) }
  const baselineOnlyFields = []
  if (stateVersion < WATCH_STATE_VERSION) {
    for (const field of VERSION_TWO_FIELDS) {
      if (!Object.hasOwn(comparisonState, field)) {
        comparisonState[field] = current[field]
        if (current[field] !== null && current[field] !== undefined) baselineOnlyFields.push(field)
      }
    }
  }
  return { comparisonState, baselineOnlyFields }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function createPlanningAlertWatcher({
  supabase,
  fetchImpl = fetch,
  sleepFn = sleep,
  delayMs = 0,
}) {
  async function fetchJson(url, label, headers = {}) {
    let lastError = null
    for (let attempt = 1; attempt <= 4; attempt += 1) {
      try {
        const response = await fetchImpl(url, {
          headers: { "User-Agent": "OpenList Planning alert watcher", ...headers },
        })
        if (response.status === 404) return { ok: false, reason: "not_found" }
        if (response.ok) {
          const data = await response.json()
          if (data.error) {
            return { ok: false, reason: "source_error", error: data.error.message || JSON.stringify(data.error) }
          }
          return { ok: true, data }
        }
        lastError = new Error(`${label}: HTTP ${response.status}`)
        if (![408, 425, 429, 500, 502, 503, 504].includes(response.status)) break
      } catch (error) {
        lastError = error
      }
      await sleepFn(attempt * 1000)
    }
    return { ok: false, reason: "fetch_error", error: String(lastError) }
  }

  async function fetchCorkApplication(app, config) {
    const sourceApplicationId = corkAgileSourceApplicationId(config, app)
    if (!sourceApplicationId) {
      return { ok: false, reason: "missing_source_application_id" }
    }
    const result = await fetchJson(`${CORK_DETAIL_URL}/${sourceApplicationId}`, app.reference, {
      "x-client": config.code,
      "x-product": "CITIZENPORTAL",
      "x-service": "PA",
    })
    if (!result.ok) return result
    const detail = result.data || {}
    const date = (sourceField, canonicalField) => Object.hasOwn(detail, sourceField)
      ? parseCorkCouncilDate(detail[sourceField])
      : app[canonicalField]
    return {
      ok: true,
      status: detail.statusOwner || detail.statusDescription || detail.statusNonOwner || app.status,
      decision_text: Object.hasOwn(detail, "decisionText") ? detail.decisionText : app.decision_text,
      decision_due_date: date("decisionDueDate", "decision_due_date"),
      decision_date: date("decisionDate", "decision_date"),
      final_grant_date: date("finalGrantDate", "final_grant_date"),
      further_information_requested_date: date("furtherInfoRequestedDate", "further_information_requested_date"),
      further_information_received_date: date("furtherInfoReceivedDate", "further_information_received_date"),
      withdrawal_date: date("withdrawnDate", "withdrawal_date"),
      appeal_lodged_date: date("appealLodgedDate", "appeal_lodged_date"),
      appeal_decision_date: date("appealDecisionDate", "appeal_decision_date"),
    }
  }

  async function fetchNationalApplication(app) {
    const sourceId = Number(app.source_application_id)
    if (!Number.isInteger(sourceId)) {
      return { ok: false, reason: "unsupported_authority" }
    }
    const params = new URLSearchParams({
      where: `OBJECTID = ${sourceId}`,
      outFields: "*",
      returnGeometry: "false",
      resultRecordCount: "1",
      f: "json",
    })
    const result = await fetchJson(`${NATIONAL_FEATURE_URL}?${params.toString()}`, app.reference)
    if (!result.ok) return result
    const row = result.data?.features?.[0]?.attributes
    if (!row) return { ok: false, reason: "not_found" }
    const reference = cleanNationalPlanningText(row.ApplicationNumber)
    if (!reference || reference !== app.reference) {
      return { ok: false, reason: "reference_mismatch" }
    }
    return {
      ok: true,
      ...sourceState({
        status: cleanNationalPlanningText(row.ApplicationStatus),
        decision_text: cleanNationalPlanningText(row.Decision),
        decision_date: parseNationalArcgisDate(row.DecisionDate),
        decision_due_date: parseNationalArcgisDate(row.DecisionDueDate),
        final_grant_date: parseNationalArcgisDate(row.GrantDate),
        further_information_requested_date: parseNationalArcgisDate(row.FIRequestDate),
        further_information_received_date: parseNationalArcgisDate(row.FIRecDate),
        withdrawal_date: parseNationalArcgisDate(row.WithdrawnDate),
        appeal_lodged_date: parseNationalArcgisDate(row.AppealSubmittedDate),
        appeal_decision_date: parseNationalArcgisDate(row.AppealDecisionDate),
      }),
    }
  }

  async function fetchSourceState(app) {
    if (EPLAN_AUTHORITIES[app.local_authority_code]) {
      const source = await fetchEplanApplication(app.local_authority_code, app.reference, { fetchImpl })
      return { strategy: "eplan", source: source.ok ? { ok: true, ...sourceState(source) } : source }
    }
    const corkConfig = corkAgileApplicationConfig(app)
    if (corkConfig) {
      return { strategy: "cork_official_api", source: await fetchCorkApplication(app, corkConfig) }
    }
    return { strategy: "national_arcgis_exact", source: await fetchNationalApplication(app) }
  }

  async function loadWatchedApplications(applicationId = null) {
    let query = supabase
      .from("planning_alert_subscriptions")
      .select(`
        application_id,
        planning_applications(
          id,reference,local_authority_code,source_application_id,source_url,registration_date,status,normalized_status,
          decision_text,decision_date,decision_due_date,final_grant_date,
          further_information_requested_date,further_information_received_date,
          withdrawal_date,appeal_lodged_date,appeal_decision_date
        )
      `)
      .eq("enabled", true)
    if (applicationId) query = query.eq("application_id", applicationId)
    const { data, error } = await query
    if (error) throw error
    return [...new Map((data || []).map((row) => [row.application_id, row.planning_applications])).values()]
      .filter(Boolean)
  }

  async function upsertWatchFailure(app, strategy, now, source) {
    const { error } = await supabase.from("planning_alert_watch_state").upsert({
      application_id: app.id,
      initialization_attempted_at: now,
      last_checked_at: now,
      source_strategy: strategy,
      last_error: source.reason || source.error || "source_failure",
      updated_at: now,
    })
    if (error) throw error
  }

  async function recordObservedChange(app, field, value, now, strategy) {
    const types = EVENT_TYPES[field]
    if (!types) return false
    let query = supabase
      .from("planning_application_events")
      .select("id")
      .eq("application_id", app.id)
      .eq("source_field", field)
      .in("event_type", types)
      .order("detected_at", { ascending: false })
      .limit(1)

    if (DATE_EVENT_FIELDS.has(field)) query = query.eq("event_date", value)
    else if (field === "status") query = query.eq("new_value", normalisePlanningStatus(value))
    else query = query.eq("new_value", value)

    const { data: event, error } = await query.maybeSingle()
    if (error) throw error
    if (!event) return false
    const changeValue = field === "status" ? planningStatusKey(value) : value
    const { error: changeError } = await supabase.from("planning_alert_observed_changes").upsert(
      {
        application_id: app.id,
        event_id: event.id,
        observed_at: now,
        source: strategy,
        source_field: field,
        change_key: `${field}:${changeValue}`,
      },
      { onConflict: "application_id,change_key" }
    )
    if (changeError) throw changeError
    return true
  }

  async function updateCanonical(app, updates, now) {
    if (Object.keys(updates).length === 0) return false
    const { error } = await supabase
      .from("planning_applications")
      .update({ ...updates, updated_at: now })
      .eq("id", app.id)
    if (error) throw error
    return true
  }

  async function queueRevalidation(applicationId, now) {
    const { error } = await supabase.from("planning_revalidation_queue").upsert(
      { application_id: applicationId, requested_at: now, updated_at: now },
      { onConflict: "application_id" }
    )
    if (error) throw error
  }

  async function processApplication(app) {
    const now = new Date().toISOString()
    const { data: watch, error: watchError } = await supabase
      .from("planning_alert_watch_state")
      .select("initialized_at,state,state_version")
      .eq("application_id", app.id)
      .maybeSingle()
    if (watchError) throw watchError

    const { strategy, source } = await fetchSourceState(app)
    if (!source.ok) {
      await upsertWatchFailure(app, strategy, now, source)
      return { outcome: "failure", changed: 0 }
    }

    const state = sourceState(source)
    if (!watch?.initialized_at) {
      const baselineFields = WATCH_FIELDS.filter((field) => state[field] !== null && state[field] !== undefined)
      const baselineUpdates = applicationUpdates(app, state, baselineFields, {
        strategy,
        observedAt: now,
      })
      const updated = await updateCanonical(app, baselineUpdates, now)
      if (updated) await queueRevalidation(app.id, now)
      const { error } = await supabase.from("planning_alert_watch_state").upsert({
        application_id: app.id,
        initialized_at: now,
        state_version: WATCH_STATE_VERSION,
        initialization_attempted_at: now,
        last_checked_at: now,
        last_successful_check_at: now,
        source_strategy: strategy,
        state,
        last_error: null,
        updated_at: now,
      })
      if (error) throw error
      return { outcome: "initialized", changed: 0 }
    }

    const { comparisonState, baselineOnlyFields } = upgradeWatchComparisonState(
      watch.state,
      state,
      watch.state_version || 1
    )
    const changedFields = changedWatchFields(comparisonState, state)
    const updateFields = [...new Set([...baselineOnlyFields, ...changedFields])]
    const updates = applicationUpdates(app, state, updateFields, {
      strategy,
      observedAt: now,
    })
    await updateCanonical(app, updates, now)

    let changed = 0
    for (const field of changedFields) {
      if (await recordObservedChange(app, field, state[field], now, strategy)) changed += 1
    }
    if (updateFields.length > 0) await queueRevalidation(app.id, now)

    const { error } = await supabase.from("planning_alert_watch_state").upsert({
      application_id: app.id,
      last_checked_at: now,
      last_successful_check_at: now,
      source_strategy: strategy,
      state_version: WATCH_STATE_VERSION,
      state,
      last_error: null,
      updated_at: now,
    })
    if (error) throw error
    return { outcome: "checked", changed }
  }

  /** @param {string | null} [applicationId] */
  async function run(applicationId = null) {
    const applications = await loadWatchedApplications(applicationId)
    const report = { selected: applications.length, initialized: 0, checked: 0, changed: 0, failures: 0 }
    for (const app of applications) {
      const result = await processApplication(app)
      report[result.outcome === "failure" ? "failures" : result.outcome] += 1
      report.changed += result.changed
      if (delayMs > 0) await sleepFn(delayMs)
    }
    return report
  }

  return { fetchSourceState, processApplication, run }
}

export {
  EVENT_TYPES,
  WATCH_FIELDS,
  applicationUpdates,
  changedWatchFields,
  createPlanningAlertWatcher,
  sourceState,
  upgradeWatchComparisonState,
}
