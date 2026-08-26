import { createClient } from "@supabase/supabase-js"
import { EPLAN_AUTHORITIES, fetchEplanApplication } from "../lib/eplan-planning-source.mjs"

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
})
const catchupMode = process.env.EPLAN_CATCHUP_MODE === "historical"
const defaultLimit = catchupMode ? 80 : 500
const limit = Math.max(1, Math.min(Number(process.env.EPLAN_ACTIVE_ENRICH_LIMIT || defaultLimit), catchupMode ? 200 : 500))
const delayMs = Math.max(500, Number(process.env.EPLAN_ACTIVE_ENRICH_DELAY_MS || (catchupMode ? 1000 : 750)))
const afterId = process.env.EPLAN_ACTIVE_ENRICH_AFTER_ID || ""
const dryRun = process.argv.includes("--dry-run")

const activeStatuses = [
  "pre_validation", "registered", "under_assessment", "further_information_requested",
  "further_information_received", "appealed",
]
const lifecycleFields = [
  "further_information_requested_date", "further_information_received_date", "decision_due_date",
  "decision_date", "withdrawal_date", "appeal_lodged_date", "expiry_date",
]
// National ArcGIS remains primary for decision dates. Keep this active ePlan
// pass focused on alertable lifecycle milestones, whose dedicated trigger is
// bounded; writing ePlan decision dates also invokes the legacy broad event
// trigger and exceeds the PostgREST statement timeout.
const enrichmentFields = [
  "further_information_requested_date", "further_information_received_date",
  "withdrawal_date", "appeal_lodged_date", "expiry_date",
]
const requestedAuthorities = (process.env.EPLAN_ACTIVE_ENRICH_AUTHORITIES || "")
  .split(",")
  .map((code) => code.trim().toUpperCase())
  .filter(Boolean)
const authorityCodes = requestedAuthorities.length
  ? requestedAuthorities.filter((code) => EPLAN_AUTHORITIES[code])
  : Object.keys(EPLAN_AUTHORITIES)
if (requestedAuthorities.length && !authorityCodes.length) {
  throw new Error("EPLAN_ACTIVE_ENRICH_AUTHORITIES did not include a verified ePlan authority")
}
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function persistLifecycleUpdates(candidate, updates) {
  const { error } = await supabase.from("planning_applications")
    .update(updates)
    .eq("id", candidate.id)
    .eq("reference", candidate.reference)
    .eq("local_authority_code", candidate.local_authority_code)
  if (!error) return { ok: true, slowPath: false }

  if (error.code !== "57014") return { ok: false, error }
  const { error: fallbackError } = await supabase.rpc("openlist_apply_eplan_lifecycle_update", {
    p_id: candidate.id,
    p_authority_code: candidate.local_authority_code,
    p_reference: candidate.reference,
    p_further_information_requested_date: updates.further_information_requested_date || null,
    p_further_information_received_date: updates.further_information_received_date || null,
    p_withdrawal_date: updates.withdrawal_date || null,
    p_appeal_lodged_date: updates.appeal_lodged_date || null,
    p_expiry_date: updates.expiry_date || null,
  })
  return fallbackError
    ? { ok: false, error: fallbackError }
    : { ok: true, slowPath: true }
}

async function loadCandidates() {
  if (catchupMode) {
    const { data, error } = await supabase.rpc("openlist_eplan_lifecycle_catchup_candidates", { p_limit: limit })
    if (error) throw error
    return (data || []).filter((row) => authorityCodes.includes(row.local_authority_code))
  }

  const selected = `id,reference,local_authority_code,normalized_status,${lifecycleFields.join(",")}`
  let query = supabase.from("planning_applications")
    .select(selected)
    .in("local_authority_code", authorityCodes)
    .in("normalized_status", activeStatuses)
    .limit(1000)
  if (afterId) query = query.gt("id", afterId)
  const { data, error } = await query
  if (error) throw error
  return (data || [])
    .filter((row) => (
      !row.further_information_requested_date ||
      (row.normalized_status === "further_information_received" && !row.further_information_received_date) ||
      (row.normalized_status === "appealed" && !row.appeal_lodged_date)
    ))
    .sort((a, b) => a.id.localeCompare(b.id))
    .slice(0, limit)
}

async function recordCatchupAttempt(candidate, outcome, fieldsAdded = 0, lastError = null) {
  if (!catchupMode || dryRun) return
  const now = new Date().toISOString()
  const { error } = await supabase.from("eplan_lifecycle_catchup_attempts").upsert({
    application_id: candidate.id,
    attempted_at: now,
    outcome,
    fields_added: fieldsAdded,
    last_error: lastError,
    updated_at: now,
  }, { onConflict: "application_id" })
  if (error) throw error
}

const candidates = await loadCandidates()
const report = {
  mode: catchupMode ? "historical_catchup" : "active",
  authorities: authorityCodes,
  selected: candidates.length,
  fetched: 0,
  changed: 0,
  statusLagged: 0,
  notFound: 0,
  conflicts: 0,
  errors: 0,
  slowPathWrites: 0,
  fields: {},
}
for (const candidate of candidates) {
  let attemptOutcome = "no_change"
  let attemptFieldsAdded = 0
  let attemptError = null
  try {
    const result = await fetchEplanApplication(candidate.local_authority_code, candidate.reference)
    if (!result.ok) {
      if (result.reason === "not_found") {
        report.notFound += 1
        attemptOutcome = "not_found"
      } else {
        report.errors += 1
        attemptOutcome = "error"
        attemptError = result.reason || "source_error"
      }
      console.warn(`${candidate.local_authority_code} ${candidate.reference}: ${result.reason}`)
    } else {
      report.fetched += 1
      const updates = {}
      for (const field of enrichmentFields) {
        const incoming = result[field]
        if (!incoming) continue
        if (candidate[field]) {
          if (candidate[field] !== incoming) report.conflicts += 1
          continue
        }
        updates[field] = incoming
        report.fields[field] = (report.fields[field] || 0) + 1
      }
      attemptFieldsAdded = Object.keys(updates).length
      if (attemptFieldsAdded) {
        report.changed += 1
        attemptOutcome = "enriched"
        let persistedOk = true
        if (!dryRun) {
          const persisted = await persistLifecycleUpdates(candidate, updates)
          if (!persisted.ok) {
            persistedOk = false
            report.errors += 1
            report.changed -= 1
            attemptOutcome = "error"
            attemptError = persisted.error.code || persisted.error.message || "write_failed"
            attemptFieldsAdded = 0
            for (const field of Object.keys(updates)) report.fields[field] -= 1
            console.warn(`${candidate.local_authority_code} ${candidate.reference}: write_failed ${attemptError}`)
          } else if (persisted.slowPath) {
            report.slowPathWrites += 1
          }
        }
        if (persistedOk && (
          (updates.further_information_requested_date && candidate.normalized_status !== "further_information_requested") ||
          (updates.further_information_received_date && candidate.normalized_status !== "further_information_received")
        )) report.statusLagged += 1
      }
    }
  } catch (error) {
    report.errors += 1
    attemptOutcome = "error"
    attemptError = error instanceof Error ? error.message : String(error)
    console.warn(`${candidate.local_authority_code} ${candidate.reference}: ${attemptError}`)
  }
  await recordCatchupAttempt(candidate, attemptOutcome, attemptFieldsAdded, attemptError)
  await sleep(delayMs)
}
console.log(JSON.stringify({ ...report, nextAfterId: candidates.at(-1)?.id || null, dryRun }, null, 2))
