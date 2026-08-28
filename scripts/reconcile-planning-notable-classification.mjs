import { mkdir, writeFile } from "node:fs/promises"
import { dirname } from "node:path"
import { createClient } from "@supabase/supabase-js"
import { ACTIVE_PLANNING_STATUSES } from "../lib/planning-status.mjs"
import { classifyPlanningNotability } from "../lib/planning-notable-classifier.mjs"
import {
  DEFAULT_PLANNING_NOTABLE_RETENTION_MONTHS,
  evaluatePlanningNotableEligibility,
  planningNotableRetentionCutoff,
} from "../lib/planning-notable-eligibility.mjs"
import { classifyAndPersistPlanningApplications } from "../lib/planning-notable-persistence.mjs"

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!supabaseUrl || !serviceRoleKey) throw new Error("Missing Supabase credentials")

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
})

const argv = process.argv.slice(2)
const args = new Set(argv)
const valueFor = (name, fallback = "") => {
  const prefix = `${name}=`
  const value = argv.find((arg) => arg.startsWith(prefix))
  return value ? value.slice(prefix.length) : fallback
}
const boundedInt = (name, fallback, minimum, maximum) => {
  const value = Number(valueFor(name, fallback))
  return Number.isFinite(value) ? Math.min(maximum, Math.max(minimum, Math.floor(value))) : fallback
}

const apply = args.has("--apply")
const validate = args.has("--validate")
const fullWindow = args.has("--full-window")
const batchSize = boundedInt("--batch-size", 250, 10, 1000)
const maxBatches = boundedInt("--max-batches", 10, 1, 100)
const retentionMonths = boundedInt(
  "--retention-months",
  Number(process.env.PLANNING_NOTABLE_RETENTION_MONTHS || DEFAULT_PLANNING_NOTABLE_RETENTION_MONTHS),
  1,
  60
)
const recentChangedDays = boundedInt("--recent-changed-days", 3, 1, 30)
const initialCursor = valueFor("--cursor", "00000000-0000-0000-0000-000000000000")
const outputPath = valueFor("--output", "")
const asOf = valueFor("--as-of", new Date().toISOString().slice(0, 10))
const cutoff = planningNotableRetentionCutoff(asOf, retentionMonths)
const selectFields = [
  "id", "local_authority", "local_authority_code", "reference", "proposal",
  "applicant_name", "application_type", "status", "normalized_status",
  "registration_date", "decision_date", "final_grant_date", "withdrawal_date",
  "appeal_decision_date", "updated_at",
].join(",")

function increment(target, key, amount = 1) {
  target[key || "UNKNOWN"] = (target[key || "UNKNOWN"] || 0) + amount
}

async function fetchPaged(table, fields, configure = (query) => query) {
  const rows = []
  let cursor = ""
  for (;;) {
    let query = supabase.from(table).select(fields).order("id", { ascending: true }).limit(1000)
    if (cursor) query = query.gt("id", cursor)
    const { data, error } = await configure(
      query
    )
    if (error) throw error
    rows.push(...(data || []))
    if (!data || data.length < 1000) break
    cursor = data.at(-1).id
  }
  return rows
}

async function fetchReconciliationWindow() {
  const rows = []
  let cursor = "00000000-0000-0000-0000-000000000000"
  for (;;) {
    const { data, error } = await supabase.rpc("openlist_planning_notable_reconciliation_candidates", {
      p_after: cursor,
      p_limit: 1000,
      p_retention_months: retentionMonths,
      p_recent_changed_days: recentChangedDays,
      p_full_window: true,
    })
    if (error) return { rows: null, error }
    rows.push(...(data || []))
    if (!data || data.length < 1000) return { rows, error: null }
    cursor = data.at(-1).id
  }
}

async function fetchApplicationsByIds(ids) {
  const rows = []
  for (let offset = 0; offset < ids.length; offset += 100) {
    const { data, error } = await supabase.from("planning_applications")
      .select(selectFields).in("id", ids.slice(offset, offset + 100))
    if (error) throw error
    rows.push(...(data || []))
  }
  return rows
}

function summarizeEligible(rowsById, structuralById, overrideIds) {
  const eligibleIds = new Set([...structuralById.keys(), ...overrideIds])
  const categoryCounts = {}
  const authorityCounts = {}
  for (const id of eligibleIds) {
    const row = rowsById.get(id)
    if (!row) continue
    increment(authorityCounts, row.local_authority_code)
    const structural = structuralById.get(id)
    for (const category of structural?.categories || []) increment(categoryCounts, category)
    if (overrideIds.has(id)) increment(categoryCounts, "press/manual")
  }
  return { eligibleIds, categoryCounts, authorityCounts }
}

async function findHistoricalStructuralExample() {
  const terminalStatuses = ["final_grant", "appeal_decided", "withdrawn", "invalid", "finalised"]
  for (let offset = 0; offset < 5000; offset += 1000) {
    const { data, error } = await supabase.from("planning_applications")
      .select(selectFields)
      .in("normalized_status", terminalStatuses)
      .lt("decision_date", cutoff)
      .order("decision_date", { ascending: false })
      .range(offset, offset + 999)
    if (error) throw error
    for (const row of data || []) {
      const classification = classifyPlanningNotability(row)
      const eligibility = evaluatePlanningNotableEligibility(row, null, {
        structurallyNotable: classification.notable, asOf, retentionMonths,
      })
      if (classification.notable && !eligibility.priorityEligible) {
        return {
          authority: row.local_authority_code,
          reference: row.reference,
          categories: classification.categories,
          latestOutcomeDate: eligibility.latestOutcomeDate,
          proposal: String(row.proposal || "").slice(0, 240),
        }
      }
    }
    if (!data || data.length < 1000) break
  }
  return null
}

async function validationRun() {
  const reconciliationWindow = await fetchReconciliationWindow()
  let activeRows
  const recentById = new Map()
  if (reconciliationWindow.rows) {
    activeRows = reconciliationWindow.rows.filter((row) => ACTIVE_PLANNING_STATUSES.includes(row.normalized_status))
    for (const row of reconciliationWindow.rows) {
      const eligibility = evaluatePlanningNotableEligibility(row, null, { asOf, retentionMonths })
      if (eligibility.latestOutcomeDate && eligibility.latestOutcomeDate >= cutoff && eligibility.latestOutcomeDate <= asOf) {
        recentById.set(row.id, row)
      }
    }
  } else {
    activeRows = await fetchPaged("planning_applications", selectFields, (query) =>
      query.in("normalized_status", ACTIVE_PLANNING_STATUSES)
    )
    for (const field of ["decision_date", "final_grant_date", "withdrawal_date", "appeal_decision_date"]) {
      const rows = await fetchPaged("planning_applications", selectFields, (query) =>
        query.gte(field, cutoff).lte(field, asOf)
      )
      for (const row of rows) recentById.set(row.id, row)
    }
  }
  const recentRows = [...recentById.values()]

  let { data: existingNotable, error: notableError } = await supabase
    .from("planning_seo_notable")
    .select("application_id,source,active,classification_sources")
    .eq("active", true)
    .limit(50000)
  if (notableError?.code === "42703") {
    const legacy = await supabase.from("planning_seo_notable")
      .select("application_id,source,active").eq("active", true).limit(50000)
    existingNotable = legacy.data
    notableError = legacy.error
  }
  if (notableError) throw notableError
  const overrideIds = new Set((existingNotable || [])
    .filter((row) => {
      const sources = Array.isArray(row.classification_sources)
        ? row.classification_sources
        : [row.source]
      return sources.some((source) => source && source !== "deterministic")
    })
    .map((row) => row.application_id))
  const overrideRows = await fetchApplicationsByIds([...overrideIds])

  const rowsById = new Map([...activeRows, ...recentRows, ...overrideRows].map((row) => [row.id, row]))
  const activeStructural = new Map()
  const recentStructural = new Map()
  for (const row of activeRows) {
    const classification = classifyPlanningNotability(row)
    if (classification.notable) activeStructural.set(row.id, classification)
  }
  for (const row of recentRows) {
    const classification = classifyPlanningNotability(row)
    if (classification.notable) recentStructural.set(row.id, classification)
  }
  const structuralById = new Map([...activeStructural, ...recentStructural])
  const outsideWindowOverrides = overrideRows.filter((row) => {
    const eligibility = evaluatePlanningNotableEligibility(row, null, { asOf, retentionMonths })
    return !eligibility.active
      && !(eligibility.latestOutcomeDate && eligibility.latestOutcomeDate >= cutoff)
  })
  const summary = summarizeEligible(rowsById, structuralById, overrideIds)

  const activeExample = activeRows.find((row) => activeStructural.has(row.id))
  const recentExample = recentRows.find((row) => recentStructural.has(row.id) && !activeStructural.has(row.id))
  const overrideExample = outsideWindowOverrides[0]
  const formatExample = (row, classification = null) => row ? ({
    authority: row.local_authority_code,
    reference: row.reference,
    categories: classification?.categories || ["press/manual"],
    proposal: String(row.proposal || "").slice(0, 240),
  }) : null

  return {
    mode: "active-recent-validation",
    dryRun: true,
    asOf,
    retentionMonths,
    cutoff,
    activeApplicationsScanned: activeRows.length,
    activeStructurallyNotable: activeStructural.size,
    recentOutcomeApplicationsScanned: recentRows.length,
    recentOutcomeStructurallyNotable: recentStructural.size,
    pressManualOutsideWindow: outsideWindowOverrides.length,
    totalSitemapEligible: summary.eligibleIds.size,
    categoryCounts: summary.categoryCounts,
    authorityCounts: summary.authorityCounts,
    examples: {
      activeIncluded: formatExample(activeExample, activeExample && activeStructural.get(activeExample.id)),
      recentOutcomeIncluded: formatExample(recentExample, recentExample && recentStructural.get(recentExample.id)),
      historicalStructuralExcluded: await findHistoricalStructuralExample(),
      pressManualOverrideIncluded: formatExample(overrideExample),
    },
    failures: [],
    remainingWork: "No historical corpus scan or production write was performed.",
  }
}

async function reconciliationRun() {
  let cursor = initialCursor
  let batchesCompleted = 0
  let lastBatchFull = false
  const aggregate = { scanned: 0, notable: 0, changed: 0, created: 0, updated: 0 }
  const categoryCounts = {}
  const authorityCounts = {}
  const failures = []

  while (batchesCompleted < maxBatches) {
    const { data, error } = await supabase.rpc("openlist_planning_notable_reconciliation_candidates", {
      p_after: cursor,
      p_limit: batchSize,
      p_retention_months: retentionMonths,
      p_recent_changed_days: recentChangedDays,
      p_full_window: fullWindow,
    })
    if (error) throw error
    const rows = data || []
    lastBatchFull = rows.length === batchSize
    if (!rows.length) break

    try {
      const persisted = await classifyAndPersistPlanningApplications(supabase, rows, {
        dryRun: !apply,
        retentionMonths,
      })
      for (const key of Object.keys(aggregate)) aggregate[key] += persisted[key] || 0
      for (const result of persisted.results) {
        if (!result.classification.notable) continue
        increment(authorityCounts, result.application.local_authority_code)
        for (const category of result.classification.categories) increment(categoryCounts, category)
      }
    } catch (error) {
      failures.push({ cursor, rows: rows.length, error: error instanceof Error ? error.message : String(error) })
      break
    }

    cursor = rows.at(-1).id
    batchesCompleted += 1
    console.log(`Batch ${batchesCompleted}/${maxBatches}: scanned ${rows.length}; cursor ${cursor}`)
    if (!lastBatchFull) break
  }

  return {
    mode: fullWindow ? "active-recent-reconciliation" : "incremental-reconciliation",
    dryRun: !apply,
    retentionMonths,
    recentChangedDays,
    batchSize,
    maxBatches,
    totalRowsScanned: aggregate.scanned,
    totalStructurallyNotable: aggregate.notable,
    newNotableRows: aggregate.created,
    existingNotableRowsUpdated: aggregate.updated,
    materiallyChangedRows: aggregate.changed,
    categoryCounts,
    authorityCounts,
    failures,
    batchesCompleted,
    nextCursor: lastBatchFull ? cursor : null,
    complete: !lastBatchFull,
  }
}

const report = {
  generatedAt: new Date().toISOString(),
  ...(validate ? await validationRun() : await reconciliationRun()),
}
const rendered = JSON.stringify(report, null, 2)
console.log(rendered)
if (outputPath) {
  await mkdir(dirname(outputPath), { recursive: true })
  await writeFile(outputPath, `${rendered}\n`, "utf8")
}
