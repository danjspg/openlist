import { mkdir, writeFile } from "node:fs/promises"
import { dirname } from "node:path"
import { createClient } from "@supabase/supabase-js"
import { classifyPlanningNotability } from "../lib/planning-notable-classifier.mjs"
import { classifyAndPersistPlanningApplications } from "../lib/planning-notable-persistence.mjs"

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!supabaseUrl || !serviceRoleKey) throw new Error("Missing Supabase credentials")

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
})

const args = new Set(process.argv.slice(2))
const valueFor = (name, fallback = "") => {
  const prefix = `${name}=`
  const value = process.argv.slice(2).find((arg) => arg.startsWith(prefix))
  return value ? value.slice(prefix.length) : fallback
}
const boundedInt = (name, fallback, minimum, maximum) => {
  const value = Number(valueFor(name, fallback))
  return Number.isFinite(value) ? Math.min(maximum, Math.max(minimum, Math.floor(value))) : fallback
}

const apply = args.has("--apply")
const validate = args.has("--validate")
const batchSize = boundedInt("--batch-size", 250, 10, 1000)
const maxBatches = boundedInt("--max-batches", 10, 1, 100)
const samplePerAuthority = boundedInt("--sample-per-authority", 25, 5, 100)
const recentDays = boundedInt("--recent-days", 0, 0, 30)
const initialCursor = valueFor("--cursor", "")
const outputPath = valueFor("--output", "")
const selectFields = "id,local_authority,local_authority_code,reference,proposal,applicant_name,application_type,registration_date,updated_at"

const AUTHORITY_CODES = [
  "CORKCOCO", "CORKCITY", "DUBLINCITY", "FINGAL", "SOUTHDUBLIN", "DLR", "KILDARE", "GALWAYCOCO", "GALWAYCITY",
  "MEATH", "WICKLOW", "LIMERICK", "WATERFORD", "DONEGAL", "WEXFORD", "TIPPERARY", "KERRY", "MAYO", "CLARE",
  "LOUTH", "LAOIS", "KILKENNY", "OFFALY", "CAVAN", "ROSCOMMON", "WESTMEATH", "MONAGHAN", "LONGFORD",
  "LEITRIM", "SLIGO", "CARLOW",
]

function increment(target, key, amount = 1) {
  target[key] = (target[key] || 0) + amount
}

function classificationSummary(rows, classifications, authorityTotals = new Map()) {
  const categoryCounts = {}
  const authorityCounts = {}
  const authoritySample = {}
  const includedExamples = []
  const excludedExamples = []
  let notable = 0

  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index]
    const result = classifications[index]
    increment(authoritySample, row.local_authority_code)
    if (result.notable) {
      notable += 1
      increment(authorityCounts, row.local_authority_code)
      for (const category of result.categories) increment(categoryCounts, category)
      if (includedExamples.length < 30) includedExamples.push({
        authority: row.local_authority_code, reference: row.reference,
        categories: result.categories, proposal: String(row.proposal || "").slice(0, 240),
      })
    } else if (excludedExamples.length < 30) {
      excludedExamples.push({
        authority: row.local_authority_code, reference: row.reference,
        exclusions: result.signals.exclusions, proposal: String(row.proposal || "").slice(0, 240),
      })
    }
  }

  let estimatedHistoricalNotable = null
  if (authorityTotals.size) {
    estimatedHistoricalNotable = 0
    for (const [authority, total] of authorityTotals) {
      const sampled = authoritySample[authority] || 0
      const matched = authorityCounts[authority] || 0
      if (sampled) estimatedHistoricalNotable += Math.round(total * matched / sampled)
    }
  }

  return {
    scanned: rows.length,
    notable,
    notableRate: rows.length ? Number((notable / rows.length).toFixed(4)) : 0,
    estimatedHistoricalNotable,
    categoryCounts,
    authorityCounts,
    authoritySample,
    includedExamples,
    excludedExamples,
  }
}

async function validationRun() {
  const rows = []
  const failures = []
  const authorityTotals = new Map()
  const { data: snapshots, error: snapshotsError } = await supabase
    .from("planning_dashboard_snapshots")
    .select("authority_code,payload")
    .in("authority_code", AUTHORITY_CODES)
  if (snapshotsError) throw snapshotsError
  const snapshotByAuthority = new Map((snapshots || []).map((row) => [row.authority_code, row.payload]))
  for (const code of AUTHORITY_CODES) {
    const { data, error } = await supabase.from("planning_applications")
      .select(selectFields)
      .eq("local_authority_code", code)
      .limit(samplePerAuthority)
    if (error) {
      failures.push({ authority: code, error: error.message })
      continue
    }
    rows.push(...(data || []))
    const snapshot = snapshotByAuthority.get(code)
    authorityTotals.set(code, Number(snapshot?.totalCount || 0))
  }

  const classifications = rows.map((row) => classifyPlanningNotability(row))
  const ids = rows.filter((_, index) => classifications[index].notable).map((row) => row.id)
  const existingIds = new Set()
  for (let offset = 0; offset < ids.length; offset += 100) {
    const { data, error } = await supabase.from("planning_seo_notable")
      .select("application_id").in("application_id", ids.slice(offset, offset + 100))
    if (error) throw error
    for (const row of data || []) existingIds.add(row.application_id)
  }

  return {
    mode: "validation-sample",
    dryRun: true,
    samplePerAuthority,
    ...classificationSummary(rows, classifications, authorityTotals),
    newNotableRows: ids.filter((id) => !existingIds.has(id)).length,
    existingNotableRows: ids.filter((id) => existingIds.has(id)).length,
    failures,
    batchesCompleted: AUTHORITY_CODES.length,
    remainingWork: "Historical backfill not started; validation is read-only.",
  }
}

async function boundedClassificationRun() {
  let cursor = initialCursor
  let batchesCompleted = 0
  let complete = false
  const scannedRows = []
  const scannedClassifications = []
  const failures = []
  const aggregate = { scanned: 0, notable: 0, changed: 0, created: 0, updated: 0 }
  const recentCutoff = recentDays > 0
    ? new Date(Date.now() - recentDays * 86400000).toISOString()
    : null

  while (batchesCompleted < maxBatches) {
    let query = supabase.from("planning_applications").select(selectFields)
    if (recentCutoff) query = query.gte("updated_at", recentCutoff)
    if (cursor) query = query.gt("id", cursor)
    const { data, error } = await query.order("id", { ascending: true }).limit(batchSize)
    if (error) throw error
    const rows = data || []
    if (!rows.length) { complete = true; break }
    scannedRows.push(...rows)
    scannedClassifications.push(...rows.map((row) => classifyPlanningNotability(row)))

    try {
      const persisted = await classifyAndPersistPlanningApplications(supabase, rows, { dryRun: !apply })
      for (const key of Object.keys(aggregate)) aggregate[key] += persisted[key] || 0
    } catch (error) {
      failures.push({ cursor, rows: rows.length, error: error instanceof Error ? error.message : String(error) })
      // Keep the prior cursor so the failed batch is retried on resume rather
      // than silently skipped.
      break
    }

    cursor = rows.at(-1).id
    batchesCompleted += 1
    console.log(`Batch ${batchesCompleted}/${maxBatches}: scanned ${rows.length}; cursor ${cursor}`)
    if (rows.length < batchSize) { complete = true; break }
  }

  let remainingQuery = supabase.from("planning_applications")
    .select("id", { count: "exact", head: true })
    .gt("id", cursor || "00000000-0000-0000-0000-000000000000")
  if (recentCutoff) remainingQuery = remainingQuery.gte("updated_at", recentCutoff)
  const { count: remainingRows, error: countError } = await remainingQuery
  if (countError) throw countError

  const summary = classificationSummary(scannedRows, scannedClassifications)
  return {
    mode: recentDays ? "recent-safety-sweep" : "historical-backfill",
    dryRun: !apply,
    batchSize,
    maxBatches,
    recentDays: recentDays || null,
    ...summary,
    totalRowsScanned: scannedRows.length,
    totalNotable: summary.notable,
    newNotableRows: aggregate.created,
    existingNotableRowsUpdated: aggregate.updated,
    materiallyChangedRows: aggregate.changed,
    failures,
    batchesCompleted,
    nextCursor: complete ? null : cursor,
    remainingRows: complete ? 0 : remainingRows,
    complete,
  }
}

const report = {
  generatedAt: new Date().toISOString(),
  ...(validate ? await validationRun() : await boundedClassificationRun()),
}
const rendered = JSON.stringify(report, null, 2)
console.log(rendered)
if (outputPath) {
  await mkdir(dirname(outputPath), { recursive: true })
  await writeFile(outputPath, `${rendered}\n`, "utf8")
}
