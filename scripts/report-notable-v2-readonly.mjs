import { performance } from "node:perf_hooks"
import { createClient } from "@supabase/supabase-js"
import { classifyPlanningNotability } from "../lib/planning-notable-classifier.mjs"
import { evaluatePlanningNotableEligibility } from "../lib/planning-notable-eligibility.mjs"

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) throw new Error("Missing Supabase credentials")
const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
const started = performance.now()

async function pagedTable(table, select, configure = (query) => query, cap = 100_000) {
  const rows = []
  for (let offset = 0; offset < cap; offset += 1000) {
    const { data, error } = await configure(supabase.from(table).select(select)).range(offset, offset + 999)
    if (error) throw error
    rows.push(...(data || []))
    if ((data || []).length < 1000) break
  }
  return rows
}

const notableRows = await pagedTable("planning_seo_notable", "application_id,active,priority_eligible,notable_categories,classification_sources,classification_reasons")
const existingById = new Map(notableRows.map((row) => [row.application_id, row]))
const applications = new Map()

for (let offset = 0; offset < notableRows.length; offset += 200) {
  const ids = notableRows.slice(offset, offset + 200).map((row) => row.application_id)
  const { data, error } = await supabase.from("planning_applications").select("id,local_authority_code,reference,proposal,applicant_name,application_type,status,normalized_status,registration_date,decision_date,final_grant_date,withdrawal_date,appeal_decision_date,updated_at").in("id", ids)
  if (error) throw error
  for (const row of data || []) applications.set(row.id, row)
}

let cursor = "00000000-0000-0000-0000-000000000000"
let candidateAuditComplete = false
for (let page = 0; page < 60; page += 1) {
  const { data, error } = await supabase.rpc("openlist_planning_notable_reconciliation_candidates", { p_after: cursor, p_limit: 1000, p_retention_months: 12, p_recent_changed_days: 1, p_full_window: true })
  if (error) throw error
  for (const row of data || []) applications.set(row.id, row)
  if ((page + 1) % 10 === 0) console.error(`Read-only notable audit: ${page + 1} bounded pages`)
  if (data?.length) cursor = data.at(-1).id
  if (!data?.length || data.length < 1000) { candidateAuditComplete = true; break }
}

const report = {
  generatedAt: new Date().toISOString(),
  input: { existingNotableRows: notableRows.length, auditedCandidateApplications: applications.size, candidateAuditComplete, safeCursor: cursor },
  before: {
    structurallyNotable: notableRows.filter((row) => row.active).length,
    priorityEligible: notableRows.filter((row) => row.active && row.priority_eligible).length,
    residentialLarge: notableRows.filter((row) => row.active && row.notable_categories?.includes("residential-large")).length,
    residentialLargePriority: notableRows.filter((row) => row.active && row.priority_eligible && row.notable_categories?.includes("residential-large")).length,
  },
  after: { structurallyNotable: 0, priorityEligible: 0, residential: 0, residentialLarge: 0, netNew10to19: 0, correctedExisting20Plus: 0, historicalByScale: { "10-49": 0, "50-99": 0, "100+": 0 } },
}

for (const application of applications.values()) {
  const existing = existingById.get(application.id) || null
  const classification = classifyPlanningNotability(application)
  const override = (existing?.classification_sources || []).some((source) => source !== "deterministic")
  const structurallyNotable = classification.notable || override
  if (!structurallyNotable) continue
  report.after.structurallyNotable += 1
  const units = classification.signals.residentialUnits
  const eligibility = evaluatePlanningNotableEligibility(application, existing, { structurallyNotable: classification.notable, residentialUnits: units, asOf: report.generatedAt })
  if (eligibility.priorityEligible) report.after.priorityEligible += 1
  if (classification.categories.includes("residential")) report.after.residential += 1
  if (classification.categories.includes("residential-large")) report.after.residentialLarge += 1
  if (units >= 10 && units <= 19 && !existing?.active) report.after.netNew10to19 += 1
  const oldUnits = Number(existing?.classification_reasons?.deterministic?.signals?.residentialUnits || 0)
  if (units >= 20 && oldUnits > 0 && oldUnits !== units) report.after.correctedExisting20Plus += 1
  if (!eligibility.priorityEligible && units >= 10) {
    const band = units >= 100 ? "100+" : units >= 50 ? "50-99" : "10-49"
    report.after.historicalByScale[band] += 1
  }
}

try {
  const links = await pagedTable("planning_building_control_links", "planning_application_id")
  const linkedIds = new Set(links.map((row) => row.planning_application_id))
  const structuralIds = [...applications.values()].filter((application) => classifyPlanningNotability(application).notable || (existingById.get(application.id)?.classification_sources || []).some((source) => source !== "deterministic")).map((application) => application.id)
  report.bcms = {
    structuralPopulation: structuralIds.length,
    linked: structuralIds.filter((id) => linkedIds.has(id)).length,
    unmatchedOrNotYetAudited: structuralIds.filter((id) => !linkedIds.has(id)).length,
    ambiguous: "not observable in phase-1 schema",
    newlyRepaired: 0,
  }
} catch (error) {
  report.bcms = { unavailable: error instanceof Error ? error.message : String(error) }
}

report.runtime = { readOnlyAuditMs: Math.round(performance.now() - started), incrementalScheduledPageLimit: 500, internalBatchLimit: 200 }
console.log(JSON.stringify(report, null, 2))
