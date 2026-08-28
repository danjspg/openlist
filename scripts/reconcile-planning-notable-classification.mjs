import { mkdir, writeFile } from "node:fs/promises"
import { dirname } from "node:path"
import { pathToFileURL } from "node:url"
import { createClient } from "@supabase/supabase-js"
import {
  DEFAULT_PLANNING_NOTABLE_RETENTION_MONTHS,
} from "../lib/planning-notable-eligibility.mjs"
import { classifyAndPersistPlanningApplications } from "../lib/planning-notable-persistence.mjs"

export const ZERO_UUID = "00000000-0000-0000-0000-000000000000"

function increment(target, key, amount = 1) {
  target[key || "UNKNOWN"] = (target[key || "UNKNOWN"] || 0) + amount
}

function mergeCounts(target, source) {
  for (const [key, value] of Object.entries(source || {})) {
    increment(target, key, Number(value) || 0)
  }
}

export function normaliseResumeCursor(value) {
  return String(value || "").trim() || ZERO_UUID
}

export async function runPlanningNotableReconciliation({
  supabase,
  startCursor = ZERO_UUID,
  batchSize = 250,
  maxBatches = 10,
  retentionMonths = DEFAULT_PLANNING_NOTABLE_RETENTION_MONTHS,
  recentChangedDays = 3,
  fullWindow = false,
  validate = false,
  apply = false,
  persist = classifyAndPersistPlanningApplications,
} = {}) {
  const initialCursor = normaliseResumeCursor(startCursor)
  let cursor = initialCursor
  let batchesCompleted = 0
  let lastBatchFull = false
  let failed = false
  const effectiveApply = Boolean(apply && !validate)
  const effectiveFullWindow = Boolean(fullWindow || validate)
  const aggregate = { scanned: 0, notable: 0, changed: 0, created: 0, updated: 0 }
  const categoryCounts = {}
  const authorityCounts = {}
  const failures = []

  while (batchesCompleted < maxBatches) {
    let rows
    try {
      const { data, error } = await supabase.rpc(
        "openlist_planning_notable_reconciliation_candidates",
        {
          p_after: cursor,
          p_limit: batchSize,
          p_retention_months: retentionMonths,
          p_recent_changed_days: recentChangedDays,
          p_full_window: effectiveFullWindow,
        }
      )
      if (error) throw error
      rows = data || []
    } catch (error) {
      failed = true
      failures.push({
        cursor,
        rows: 0,
        error: error instanceof Error ? error.message : String(error),
      })
      break
    }

    lastBatchFull = rows.length === batchSize
    if (!rows.length) break

    try {
      const persisted = await persist(supabase, rows, {
        dryRun: !effectiveApply,
        retentionMonths,
      })
      for (const key of Object.keys(aggregate)) aggregate[key] += persisted[key] || 0
      for (const result of persisted.results || []) {
        if (!result.classification?.notable) continue
        increment(authorityCounts, result.application?.local_authority_code)
        for (const category of result.classification.categories || []) {
          increment(categoryCounts, category)
        }
      }
    } catch (error) {
      failed = true
      failures.push({
        cursor,
        rows: rows.length,
        error: error instanceof Error ? error.message : String(error),
      })
      break
    }

    cursor = rows.at(-1).id
    batchesCompleted += 1
    if (!lastBatchFull) break
  }

  const complete = !failed && !lastBatchFull
  const nextCursor = complete ? null : cursor

  return {
    mode: validate
      ? "active-recent-validation"
      : effectiveFullWindow
        ? "active-recent-reconciliation"
        : "incremental-reconciliation",
    dryRun: !effectiveApply,
    startCursor: initialCursor,
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
    finalCursor: cursor,
    nextCursor,
    complete,
    remainingWork: complete ? "complete" : "resume required",
  }
}

export async function runPlanningNotableApplyFull({
  supabase,
  startCursor = ZERO_UUID,
  batchSize = 250,
  batchesPerChunk = 20,
  maxChunks = 20,
  retentionMonths = DEFAULT_PLANNING_NOTABLE_RETENTION_MONTHS,
  recentChangedDays = 3,
  confirmed = false,
  apply = false,
  persist = classifyAndPersistPlanningApplications,
  onChunk = async () => {},
} = {}) {
  if (!confirmed || !apply) {
    throw new Error("apply-full requires explicit confirmation and apply=true")
  }

  const initialCursor = normaliseResumeCursor(startCursor)
  let cursor = initialCursor
  let chunksCompleted = 0
  let complete = false
  const aggregate = {
    batches: 0,
    scanned: 0,
    notable: 0,
    created: 0,
    updated: 0,
    changed: 0,
  }
  const categoryCounts = {}
  const authorityCounts = {}
  const failures = []

  while (!complete && chunksCompleted < maxChunks) {
    const chunk = await runPlanningNotableReconciliation({
      supabase,
      startCursor: cursor,
      batchSize,
      maxBatches: batchesPerChunk,
      retentionMonths,
      recentChangedDays,
      fullWindow: true,
      apply: true,
      persist,
    })

    aggregate.batches += chunk.batchesCompleted
    aggregate.scanned += chunk.totalRowsScanned
    aggregate.notable += chunk.totalStructurallyNotable
    aggregate.created += chunk.newNotableRows
    aggregate.updated += chunk.existingNotableRowsUpdated
    aggregate.changed += chunk.materiallyChangedRows
    mergeCounts(categoryCounts, chunk.categoryCounts)
    mergeCounts(authorityCounts, chunk.authorityCounts)
    failures.push(...chunk.failures.map((failure) => ({
      chunk: chunksCompleted + 1,
      ...failure,
    })))
    chunksCompleted += 1

    // finalCursor is always the last successfully persisted row. A failed
    // batch therefore leaves this at the safe resume point before that batch.
    cursor = chunk.finalCursor
    complete = chunk.complete
    await onChunk({
      chunk: chunksCompleted,
      batchesCompleted: aggregate.batches,
      totalRowsScanned: aggregate.scanned,
      safeCursor: cursor,
      complete,
      failures: failures.length,
    })
    if (chunk.failures.length) break
  }

  return {
    mode: "active-recent-apply-full",
    dryRun: false,
    startCursor: initialCursor,
    finalCursor: cursor,
    nextCursor: complete ? null : cursor,
    retentionMonths,
    recentChangedDays,
    batchSize,
    batchesPerChunk,
    maxChunks,
    chunksCompleted,
    batchesCompleted: aggregate.batches,
    totalRowsScanned: aggregate.scanned,
    totalStructurallyNotable: aggregate.notable,
    newNotableRows: aggregate.created,
    existingNotableRowsUpdated: aggregate.updated,
    materiallyChangedRows: aggregate.changed,
    categoryCounts,
    authorityCounts,
    failures,
    complete,
    remainingWork: complete ? "complete" : "resume required",
  }
}

const valueFor = (argv, name, fallback = "") => {
  const prefix = `${name}=`
  const value = argv.find((argument) => argument.startsWith(prefix))
  return value === undefined ? fallback : value.slice(prefix.length)
}

const boundedInt = (argv, name, fallback, minimum, maximum) => {
  const value = Number(valueFor(argv, name, fallback))
  return Number.isFinite(value)
    ? Math.min(maximum, Math.max(minimum, Math.floor(value)))
    : fallback
}

export async function runCli(argv = process.argv.slice(2), env = process.env) {
  const args = new Set(argv)
  const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceRoleKey) throw new Error("Missing Supabase credentials")

  const validate = args.has("--validate")
  const applyFull = args.has("--apply-full")
  const outputPath = valueFor(argv, "--output", "")
  const retentionMonths = boundedInt(
    argv,
    "--retention-months",
    Number(env.PLANNING_NOTABLE_RETENTION_MONTHS || DEFAULT_PLANNING_NOTABLE_RETENTION_MONTHS),
    1,
    60
  )
  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const report = {
    generatedAt: new Date().toISOString(),
    ...(applyFull
      ? await runPlanningNotableApplyFull({
        supabase,
        startCursor: valueFor(argv, "--cursor", ZERO_UUID),
        batchSize: boundedInt(argv, "--batch-size", 250, 10, 1000),
        batchesPerChunk: boundedInt(argv, "--max-batches", 20, 1, 100),
        maxChunks: boundedInt(argv, "--max-chunks", 20, 1, 100),
        retentionMonths,
        recentChangedDays: boundedInt(argv, "--recent-changed-days", 3, 1, 30),
        confirmed: args.has("--confirm-apply-full"),
        apply: args.has("--apply"),
        onChunk: async (progress) => {
          console.log(
            `Apply-full chunk ${progress.chunk}: ${progress.totalRowsScanned} rows, `
            + `${progress.batchesCompleted} batches; safe cursor ${progress.safeCursor}; `
            + `complete=${progress.complete}; failures=${progress.failures}`
          )
        },
      })
      : await runPlanningNotableReconciliation({
        supabase,
        startCursor: valueFor(argv, "--cursor", ZERO_UUID),
        batchSize: boundedInt(argv, "--batch-size", 250, 10, 1000),
        maxBatches: boundedInt(argv, "--max-batches", 10, 1, 100),
        retentionMonths,
        recentChangedDays: boundedInt(argv, "--recent-changed-days", 3, 1, 30),
        fullWindow: args.has("--full-window"),
        validate,
        // --validate always wins over --apply inside the runner.
        apply: args.has("--apply"),
      })),
  }
  const rendered = JSON.stringify(report, null, 2)
  console.log(rendered)
  if (outputPath) {
    await mkdir(dirname(outputPath), { recursive: true })
    await writeFile(outputPath, `${rendered}\n`, "utf8")
  }
  return report
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const report = await runCli()
  if (report.mode === "active-recent-apply-full" && (!report.complete || report.failures.length)) {
    process.exitCode = 1
  }
}
