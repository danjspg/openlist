import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises"
import { dirname } from "node:path"
import { setTimeout as delay } from "node:timers/promises"
import { pathToFileURL } from "node:url"
import { createClient } from "@supabase/supabase-js"
import pg from "pg"
import {
  PUBLIC_CATEGORY_MAX_BATCHES,
  PUBLIC_CATEGORY_MAX_BATCH_SIZE,
  PUBLIC_CATEGORY_MAX_SCANNED_ROWS,
  PUBLIC_CATEGORY_ZERO_UUID,
  runPlanningPublicCategoryReconciliation,
} from "./reconcile-planning-public-categories.mjs"

const STATE_VERSION = 1
const DEFAULT_PAUSE_MS = 20_000
const MAX_RUNS_LIMIT = 1_000
const MAX_PAUSE_MS = 5 * 60_000
const UUID_PATTERN = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i

function argument(name, fallback) {
  const prefix = `--${name}=`
  const value = process.argv.find((item) => item.startsWith(prefix))?.slice(prefix.length)
  return value === undefined ? fallback : value
}

function boundedInteger(name, value, minimum, maximum) {
  const parsed = typeof value === "number" ? value : Number(value)
  if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new Error(`${name} must be an integer from ${minimum} to ${maximum}; received ${JSON.stringify(value)}`)
  }
  return parsed
}

function assertCursor(value, label = "cursor") {
  if (!UUID_PATTERN.test(String(value || ""))) {
    throw new Error(`${label} must be a UUID; received ${JSON.stringify(value)}`)
  }
  return String(value)
}

export async function readSerialProgress(statePath) {
  try {
    const state = JSON.parse(await readFile(statePath, "utf8"))
    validateProgressState(state)
    return state
  } catch (error) {
    if (error?.code === "ENOENT") return null
    throw new Error(`Could not read valid reconciliation state at ${statePath}: ${error instanceof Error ? error.message : String(error)}`)
  }
}

export async function writeSerialProgressAtomically(statePath, state) {
  validateProgressState(state)
  await mkdir(dirname(statePath), { recursive: true })
  const temporaryPath = `${statePath}.tmp-${process.pid}-${Date.now()}`
  try {
    await writeFile(temporaryPath, `${JSON.stringify(state, null, 2)}\n`, { encoding: "utf8", flag: "wx" })
    await rename(temporaryPath, statePath)
  } catch (error) {
    await unlink(temporaryPath).catch(() => {})
    throw error
  }
}

function validateProgressState(state) {
  if (!state || state.version !== STATE_VERSION) throw new Error("unsupported or missing state version")
  if (state.mode !== "apply" && state.mode !== "audit") throw new Error("state mode must be apply or audit")
  if (typeof state.complete !== "boolean") throw new Error("state complete flag must be boolean")
  assertCursor(state.lastSuccessfulCursor, "lastSuccessfulCursor")
  if (state.complete) {
    if (state.nextCursor !== null) throw new Error("complete state must not have a nextCursor")
  } else if (assertCursor(state.nextCursor, "nextCursor") !== state.lastSuccessfulCursor) {
    throw new Error("incomplete state nextCursor must equal lastSuccessfulCursor")
  }
  for (const field of ["completedTranches", "totalScanned", "totalInserted", "totalUpdated", "totalUnchanged"]) {
    if (!Number.isInteger(state[field]) || state[field] < 0) throw new Error(`invalid state counter ${field}`)
  }
  if (!state.updatedAt || Number.isNaN(Date.parse(state.updatedAt))) throw new Error("invalid state timestamp")
}

function validateTranche(report, { apply, startCursor }) {
  if (!report || typeof report !== "object") throw new Error("tranche returned no report")
  if (report.startCursor !== startCursor) {
    throw new Error(`tranche start cursor mismatch: expected ${startCursor}, received ${report.startCursor}`)
  }
  if (Boolean(report.dryRun) === apply) throw new Error("tranche apply/audit mode mismatch")
  if (report.batchSize !== PUBLIC_CATEGORY_MAX_BATCH_SIZE || report.maxBatches !== PUBLIC_CATEGORY_MAX_BATCHES) {
    throw new Error("tranche bounds differ from the required 250 x 10 limits")
  }
  if (report.maximumScannedRows !== PUBLIC_CATEGORY_MAX_SCANNED_ROWS) {
    throw new Error("tranche did not report the 2,500-row ceiling")
  }
  if (typeof report.complete !== "boolean") throw new Error("tranche returned an invalid complete flag")
  const counts = report.counts || {}
  for (const field of ["scanned", "matched", "inserted", "updated", "unchanged", "failed"]) {
    if (!Number.isInteger(counts[field]) || counts[field] < 0) {
      throw new Error(`invalid ${field} count ${counts[field]}`)
    }
  }
  if (counts.scanned > PUBLIC_CATEGORY_MAX_SCANNED_ROWS) {
    throw new Error(`invalid scanned count ${counts.scanned}`)
  }
  if (!Array.isArray(report.failures)) throw new Error("tranche returned invalid failures")
  if (counts.failed !== 0 || report.failures.length !== 0) {
    throw new Error(`tranche failed at safe cursor ${report.finalCursor || startCursor}`)
  }
  assertCursor(report.finalCursor, "finalCursor")
  if (report.complete) {
    if (report.nextCursor !== null) throw new Error("complete tranche unexpectedly returned nextCursor")
    return report.finalCursor
  }
  const nextCursor = assertCursor(report.nextCursor, "nextCursor")
  if (counts.scanned === 0 || nextCursor === startCursor || report.finalCursor !== nextCursor) {
    throw new Error(`zero-progress or inconsistent cursor at ${startCursor}`)
  }
  return nextCursor
}

export async function runSerialPlanningPublicCategoryReconciliation({
  statePath,
  startCursor,
  maxRuns = MAX_RUNS_LIMIT,
  pauseMs = DEFAULT_PAUSE_MS,
  apply = false,
  confirmed = false,
  runTranche,
  healthCheck = async () => {},
  sleep = delay,
  now = () => new Date(),
  writeProgress = writeSerialProgressAtomically,
  readProgress = readSerialProgress,
  log = (message) => console.log(message),
} = {}) {
  if (!statePath) throw new Error("statePath is required")
  if (apply && !confirmed) throw new Error("apply mode requires explicit confirmation")
  if (typeof runTranche !== "function") throw new Error("runTranche is required")
  const safeMaxRuns = boundedInteger("max-runs", maxRuns, 1, MAX_RUNS_LIMIT)
  const safePauseMs = boundedInteger("pause-ms", pauseMs, 0, MAX_PAUSE_MS)
  const mode = apply ? "apply" : "audit"
  const existing = await readProgress(statePath)
  let state

  if (existing) {
    if (existing.mode !== mode) throw new Error(`state file mode is ${existing.mode}, not ${mode}`)
    if (startCursor !== undefined && assertCursor(startCursor) !== existing.lastSuccessfulCursor) {
      throw new Error(`supplied cursor does not match saved cursor ${existing.lastSuccessfulCursor}`)
    }
    if (existing.complete) {
      log(`Reconciliation already complete at ${existing.lastSuccessfulCursor}`)
      return { state: existing, runsThisExecution: 0 }
    }
    state = { ...existing }
  } else {
    const initialCursor = assertCursor(startCursor ?? PUBLIC_CATEGORY_ZERO_UUID)
    state = {
      version: STATE_VERSION,
      mode,
      complete: false,
      lastSuccessfulCursor: initialCursor,
      nextCursor: initialCursor,
      completedTranches: 0,
      totalScanned: 0,
      totalInserted: 0,
      totalUpdated: 0,
      totalUnchanged: 0,
      updatedAt: now().toISOString(),
    }
  }

  let runsThisExecution = 0
  while (!state.complete && runsThisExecution < safeMaxRuns) {
    const trancheNumber = state.completedTranches + 1
    const trancheStart = state.lastSuccessfulCursor
    const startedAt = Date.now()
    const report = await runTranche({ startCursor: trancheStart, apply })
    const nextCursor = validateTranche(report, { apply, startCursor: trancheStart })
    const counts = report.counts

    state = {
      ...state,
      complete: Boolean(report.complete),
      lastSuccessfulCursor: nextCursor,
      nextCursor: report.complete ? null : nextCursor,
      completedTranches: trancheNumber,
      totalScanned: state.totalScanned + counts.scanned,
      totalInserted: state.totalInserted + (counts.inserted || 0),
      totalUpdated: state.totalUpdated + (counts.updated || 0),
      totalUnchanged: state.totalUnchanged + (counts.unchanged || 0),
      updatedAt: now().toISOString(),
    }
    await writeProgress(statePath, state)
    runsThisExecution += 1

    log([
      `run=${trancheNumber}`,
      `start=${trancheStart}`,
      `end=${nextCursor}`,
      `scanned=${counts.scanned}`,
      `inserted=${counts.inserted || 0}`,
      `updated=${counts.updated || 0}`,
      `unchanged=${counts.unchanged || 0}`,
      `failures=${counts.failed || 0}`,
      `elapsedMs=${report.elapsedMs ?? Date.now() - startedAt}`,
    ].join(" "))

    if (state.complete) break
    await healthCheck({ state: { ...state }, report })
    if (runsThisExecution < safeMaxRuns) await sleep(safePauseMs)
  }

  return { state, runsThisExecution }
}

async function createProductionHealthCheck({ url, key, databaseUrl }) {
  let database = null
  if (databaseUrl) {
    database = new pg.Client({
      connectionString: databaseUrl,
      application_name: "openlist-public-category-serial-health",
    })
    await database.connect()
    await database.query("set statement_timeout = '8s'")
    await database.query("set lock_timeout = '2s'")
  }

  return {
    async check() {
      const response = await fetch(`${url}/rest/v1/planning_applications?select=id&limit=1`, {
        headers: { apikey: key, authorization: `Bearer ${key}` },
        signal: AbortSignal.timeout(8_000),
      })
      if (!response.ok) throw new Error(`Data API health probe returned HTTP ${response.status}`)
      if (!database) return
      const result = await database.query(`
        select
          count(*) filter (where wait_event_type = 'Lock')::int as lock_waiters,
          count(*) filter (
            where state = 'idle in transaction'
              and now() - xact_start > interval '30 seconds'
          )::int as aged_idle_transactions,
          count(*) filter (
            where state = 'active'
              and pid <> pg_backend_pid()
              and now() - query_start > interval '30 seconds'
          )::int as severely_long_queries
        from pg_stat_activity
        where datname = current_database()
      `)
      const health = result.rows[0]
      if (health.lock_waiters > 0 || health.aged_idle_transactions > 0 || health.severely_long_queries > 0) {
        throw new Error(`database health probe failed: ${JSON.stringify(health)}`)
      }
    },
    async close() {
      if (database) await database.end()
    },
  }
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required")
  const apply = process.argv.includes("--apply")
  const confirmed = process.argv.includes("--confirm-apply")
  if (apply && !confirmed) throw new Error("apply mode requires --confirm-apply")
  const statePath = argument(
    "state",
    `artifacts/planning-public-category-serial-${apply ? "apply" : "audit"}-state.json`
  )
  const supabase = createClient(url, key, { db: { retry: false } })
  supabase.rest.retry = false
  const health = await createProductionHealthCheck({
    url,
    key,
    databaseUrl: process.env.SUPABASE_DB_URL,
  })

  try {
    const result = await runSerialPlanningPublicCategoryReconciliation({
      statePath,
      startCursor: argument("cursor", undefined),
      maxRuns: Number(argument("max-runs", String(MAX_RUNS_LIMIT))),
      pauseMs: Number(argument("pause-ms", String(DEFAULT_PAUSE_MS))),
      apply,
      confirmed,
      runTranche: ({ startCursor, apply: shouldApply }) => runPlanningPublicCategoryReconciliation({
        supabase,
        startCursor,
        batchSize: PUBLIC_CATEGORY_MAX_BATCH_SIZE,
        maxBatches: PUBLIC_CATEGORY_MAX_BATCHES,
        apply: shouldApply,
        log: (entry) => console.error(JSON.stringify(entry)),
      }),
      healthCheck: () => health.check(),
    })
    console.log(JSON.stringify({
      status: result.state.complete ? "complete" : "paused",
      runsThisExecution: result.runsThisExecution,
      state: result.state,
      statePath,
    }, null, 2))
  } finally {
    await health.close()
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main()
}
