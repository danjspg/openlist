import { createClient } from "@supabase/supabase-js"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import { dirname } from "node:path"

import {
  NATIONAL_PLANNING_LIFECYCLE_FIELDS,
  cleanNationalPlanningText,
  parseNationalArcgisDate,
} from "../lib/national-planning-source.mjs"
import { AUTHORITIES } from "./ingest-national-planning-applications.mjs"

const FEATURE_LAYER_URL =
  "https://services.arcgis.com/NzlPQPKn5QF9v2US/ArcGIS/rest/services/IrishPlanningApplications/FeatureServer/0/query"
const DEFAULT_BATCH_SIZE = 2000
const MAX_BATCH_SIZE = 5000
const MAX_RETRIES = 4
const SOURCE_FIELDS = Object.values(NATIONAL_PLANNING_LIFECYCLE_FIELDS)
const OUT_FIELDS = [
  "OBJECTID",
  "ApplicationNumber",
  ...SOURCE_FIELDS,
].join(",")

function valueAfter(args, name) {
  const index = args.indexOf(name)
  return index >= 0 ? args[index + 1] : null
}

function parseArgs(args) {
  const requestedBatchSize = Number(valueAfter(args, "--batch-size") || DEFAULT_BATCH_SIZE)
  const maxBatchesValue = valueAfter(args, "--max-batches")
  if (!Number.isInteger(requestedBatchSize) || requestedBatchSize < 1 || requestedBatchSize > MAX_BATCH_SIZE) {
    throw new Error(`--batch-size must be between 1 and ${MAX_BATCH_SIZE}`)
  }
  if (maxBatchesValue && (!Number.isInteger(Number(maxBatchesValue)) || Number(maxBatchesValue) < 1)) {
    throw new Error("--max-batches must be a positive integer")
  }
  const authorities = []
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === "--authority") authorities.push(args[index + 1])
  }
  const known = new Set([
    "--dry-run",
    "--batch-size",
    "--max-batches",
    "--authority",
    "--resume-file",
  ])
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]
    if (!known.has(arg)) throw new Error(`Unknown argument: ${arg}`)
    if (arg !== "--dry-run") index += 1
  }
  return {
    dryRun: args.includes("--dry-run"),
    batchSize: requestedBatchSize,
    maxBatches: maxBatchesValue ? Number(maxBatchesValue) : null,
    authorities,
    resumeFile: valueAfter(args, "--resume-file"),
  }
}

function selectedAuthorities(requested) {
  const wanted = new Set(requested.map((value) => value.toLowerCase()))
  const selected = AUTHORITIES.filter((authority) =>
    authority.code !== "CORKCOCO" && (
      wanted.size === 0 ||
      wanted.has(authority.code.toLowerCase()) ||
      wanted.has(authority.sourceName.toLowerCase())
    )
  )
  if (wanted.size > 0 && selected.length !== wanted.size) {
    throw new Error("One or more --authority values did not match a national authority")
  }
  return selected
}

function sqlString(value) {
  return String(value).replaceAll("'", "''")
}

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds))
}

async function fetchJson(url, label) {
  let lastError
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: { "User-Agent": "OpenList national lifecycle bulk backfill" },
      })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const data = await response.json()
      if (data.error) throw new Error(data.error.message || JSON.stringify(data.error))
      return data
    } catch (error) {
      lastError = error
      if (attempt < MAX_RETRIES) {
        const waitMs = attempt * 1000
        console.warn(`${label}: ${error.message}; retrying in ${waitMs}ms`)
        await sleep(waitMs)
      }
    }
  }
  throw lastError
}

async function fetchLifecycleBatch(authority, afterObjectId, batchSize) {
  const anyLifecycleDate = SOURCE_FIELDS.map((field) => `${field} IS NOT NULL`).join(" OR ")
  const where = [
    `PlanningAuthority = '${sqlString(authority.sourceName)}'`,
    `OBJECTID > ${Math.max(0, Number(afterObjectId) || 0)}`,
    `(${anyLifecycleDate})`,
  ].join(" AND ")
  const params = new URLSearchParams({
    where,
    outFields: OUT_FIELDS,
    returnGeometry: "false",
    resultRecordCount: String(batchSize),
    orderByFields: "OBJECTID ASC",
    f: "json",
  })
  const data = await fetchJson(
    `${FEATURE_LAYER_URL}?${params.toString()}`,
    `${authority.name} after OBJECTID ${afterObjectId}`
  )
  return (data.features || []).map((feature) => feature.attributes || {})
}

function mapLifecycleRow(row, authority) {
  const reference = cleanNationalPlanningText(row.ApplicationNumber)
  if (!reference || !Number.isInteger(row.OBJECTID)) return null
  return {
    local_authority_code: authority.code,
    reference,
    source_application_id: row.OBJECTID,
    further_information_requested_date: parseNationalArcgisDate(row.FIRequestDate),
    further_information_received_date: parseNationalArcgisDate(row.FIRecDate),
    withdrawal_date: parseNationalArcgisDate(row.WithdrawnDate),
    decision_due_date: parseNationalArcgisDate(row.DecisionDueDate),
    expiry_date: parseNationalArcgisDate(row.ExpiryDate),
    appeal_lodged_date: parseNationalArcgisDate(row.AppealSubmittedDate),
    appeal_decision_date: parseNationalArcgisDate(row.AppealDecisionDate),
  }
}

function addCounts(target, additions = {}) {
  for (const [key, value] of Object.entries(additions || {})) {
    target[key] = (target[key] || 0) + Number(value || 0)
  }
}

function mergeBatchReports(left, right) {
  const merged = {
    submitted: Number(left.submitted || 0) + Number(right.submitted || 0),
    matched: Number(left.matched || 0) + Number(right.matched || 0),
    updated: Number(left.updated || 0) + Number(right.updated || 0),
    eventsInserted: Number(left.eventsInserted || 0) + Number(right.eventsInserted || 0),
    applicationsEnriched:
      Number(left.applicationsEnriched || 0) + Number(right.applicationsEnriched || 0),
    fieldUpdates: {},
    eventUpdates: {},
  }
  addCounts(merged.fieldUpdates, left.fieldUpdates)
  addCounts(merged.fieldUpdates, right.fieldUpdates)
  addCounts(merged.eventUpdates, left.eventUpdates)
  addCounts(merged.eventUpdates, right.eventUpdates)
  return merged
}

async function applyLifecycleBatch(supabase, records, label, attempt = 1) {
  const { data, error } = await supabase.rpc(
    "openlist_backfill_national_planning_lifecycle",
    { p_rows: records }
  )
  if (!error) return data || {}

  const retryable = ["57014", "08000", "08001", "08003", "08006", "53300"].includes(error.code) ||
    /timeout|temporar|upstream|connection|fetch failed/i.test(error.message || "")
  if (retryable && records.length > 250) {
    const middle = Math.ceil(records.length / 2)
    console.warn(
      `${label}: ${records.length}-row lifecycle update timed out; retrying as ${middle} and ${records.length - middle} rows.`
    )
    const first = await applyLifecycleBatch(supabase, records.slice(0, middle), label)
    const second = await applyLifecycleBatch(supabase, records.slice(middle), label)
    return mergeBatchReports(first, second)
  }
  if (retryable && attempt < MAX_RETRIES) {
    const waitMs = attempt * 1500
    console.warn(`${label}: transient database failure; retrying in ${waitMs}ms`)
    await sleep(waitMs)
    return applyLifecycleBatch(supabase, records, label, attempt + 1)
  }
  throw error
}

async function readCheckpoint(path) {
  if (!path) return null
  try {
    return JSON.parse(await readFile(path, "utf8"))
  } catch (error) {
    if (error.code === "ENOENT") return null
    throw error
  }
}

async function saveCheckpoint(path, checkpoint) {
  if (!path) return
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, `${JSON.stringify(checkpoint, null, 2)}\n`, "utf8")
}

async function backfill(options) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!options.dryRun && (!supabaseUrl || !serviceRoleKey)) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY")
  }
  const supabase = options.dryRun ? null : createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const authorities = selectedAuthorities(options.authorities)
  const checkpoint = await readCheckpoint(options.resumeFile)
  let completeAuthorities = checkpoint?.completeAuthorities || []
  const totals = {
    sourceRows: 0,
    submitted: 0,
    matched: 0,
    updated: 0,
    eventsInserted: 0,
    applicationsEnriched: 0,
    fieldUpdates: {},
    eventUpdates: {},
  }
  let batches = 0
  const startedAt = Date.now()

  console.log(
    `National lifecycle ${options.dryRun ? "audit" : "backfill"}: ${authorities.length} authorities, batch size ${options.batchSize}.`
  )
  console.log("Uses the national ArcGIS bulk feed only; council detail APIs and page revalidation are not called.")

  for (const authority of authorities) {
    let afterObjectId = checkpoint?.authorityCode === authority.code
      ? Number(checkpoint.afterObjectId || 0)
      : 0
    if (completeAuthorities.includes(authority.code)) continue

    while (true) {
      const sourceRows = await fetchLifecycleBatch(authority, afterObjectId, options.batchSize)
      if (sourceRows.length === 0) break
      const mapped = sourceRows.map((row) => mapLifecycleRow(row, authority)).filter(Boolean)
      const records = [...new Map(mapped.map((row) => [row.reference, row])).values()]
      const nextObjectId = Math.max(...sourceRows.map((row) => Number(row.OBJECTID) || 0))
      totals.sourceRows += sourceRows.length
      batches += 1

      if (options.dryRun) {
        totals.submitted += records.length
        for (const field of Object.keys(NATIONAL_PLANNING_LIFECYCLE_FIELDS)) {
          totals.fieldUpdates[field] = (totals.fieldUpdates[field] || 0) +
            records.filter((record) => record[field] !== null).length
        }
      } else {
        let data
        try {
          data = await applyLifecycleBatch(
            supabase,
            records,
            `${authority.name} batch ${batches}`
          )
        } catch (error) {
          throw new Error(`${authority.name} batch ${batches}: ${error.message}`)
        }
        totals.submitted += Number(data.submitted || 0)
        totals.matched += Number(data.matched || 0)
        totals.updated += Number(data.updated || 0)
        totals.eventsInserted += Number(data.eventsInserted || 0)
        totals.applicationsEnriched += Number(data.applicationsEnriched || 0)
        addCounts(totals.fieldUpdates, data.fieldUpdates)
        addCounts(totals.eventUpdates, data.eventUpdates)
      }

      afterObjectId = nextObjectId
      await saveCheckpoint(options.resumeFile, {
        authorityCode: authority.code,
        afterObjectId,
        completeAuthorities,
        batches,
        totals,
        updatedAt: new Date().toISOString(),
      })
      console.log(
        `${authority.code} batch ${batches}: ${sourceRows.length} source rows through OBJECTID ${afterObjectId}; ${totals.updated} records and ${totals.eventsInserted} events updated so far.`
      )

      if (options.maxBatches && batches >= options.maxBatches) {
        return { stoppedAfterBoundedRun: true, batches, totals, runtimeSeconds: (Date.now() - startedAt) / 1000 }
      }
      if (sourceRows.length < options.batchSize) break
    }

    completeAuthorities = [...new Set([
      ...completeAuthorities,
      authority.code,
    ])]
    await saveCheckpoint(options.resumeFile, {
      authorityCode: authority.code,
      afterObjectId,
      completeAuthorities,
      batches,
      totals,
      updatedAt: new Date().toISOString(),
    })
  }

  let productionReport = null
  if (supabase) {
    const { data, error } = await supabase.rpc("openlist_national_planning_lifecycle_report")
    if (error) throw error
    productionReport = data
  }
  return {
    stoppedAfterBoundedRun: false,
    batches,
    totals,
    runtimeSeconds: (Date.now() - startedAt) / 1000,
    productionReport,
  }
}

const isDirectRun = import.meta.url === `file://${process.argv[1]}`
if (isDirectRun) {
  backfill(parseArgs(process.argv.slice(2)))
    .then((report) => console.log(JSON.stringify(report, null, 2)))
    .catch((error) => {
      console.error(error)
      process.exitCode = 1
    })
}

export {
  backfill,
  applyLifecycleBatch,
  fetchLifecycleBatch,
  mapLifecycleRow,
  parseArgs,
}
