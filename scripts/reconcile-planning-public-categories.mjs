import { mkdir, writeFile } from "node:fs/promises"
import { dirname } from "node:path"
import { pathToFileURL } from "node:url"
import { createClient } from "@supabase/supabase-js"
import { classifyAndPersistPlanningApplications } from "../lib/planning-notable-persistence.mjs"

export const PUBLIC_CATEGORY_ZERO_UUID = "00000000-0000-0000-0000-000000000000"
export const PUBLIC_CATEGORY_MAX_BATCH_SIZE = 250
export const PUBLIC_CATEGORY_MAX_BATCHES = 10

const CANDIDATE_SELECT = [
  "id", "local_authority", "local_authority_code", "reference", "proposal",
  "applicant_name", "application_type", "status", "normalized_status",
  "registration_date", "decision_date", "final_grant_date", "withdrawal_date",
  "appeal_decision_date", "updated_at",
].join(",")

export async function runPlanningPublicCategoryReconciliation({
  supabase,
  startCursor = PUBLIC_CATEGORY_ZERO_UUID,
  batchSize = PUBLIC_CATEGORY_MAX_BATCH_SIZE,
  maxBatches = 1,
  apply = false,
  persist = classifyAndPersistPlanningApplications,
} = {}) {
  const safeBatchSize = Math.max(1, Math.min(Number(batchSize) || PUBLIC_CATEGORY_MAX_BATCH_SIZE, PUBLIC_CATEGORY_MAX_BATCH_SIZE))
  const safeMaxBatches = Math.max(1, Math.min(Number(maxBatches) || 1, PUBLIC_CATEGORY_MAX_BATCHES))
  const initialCursor = String(startCursor || "").trim() || PUBLIC_CATEGORY_ZERO_UUID
  let cursor = initialCursor
  let batchesCompleted = 0
  let lastBatchFull = false
  const counts = { scanned: 0, matched: 0, inserted: 0, updated: 0, unchanged: 0, failed: 0 }
  const categoryCounts = {}
  const failures = []

  while (batchesCompleted < safeMaxBatches) {
    const { data, error } = await supabase
      .from("planning_applications")
      .select(CANDIDATE_SELECT)
      .gt("id", cursor)
      .order("id", { ascending: true })
      .limit(safeBatchSize)
    if (error) {
      counts.failed += 1
      failures.push({ cursor, error: error.message || String(error) })
      break
    }

    const rows = data || []
    lastBatchFull = rows.length === safeBatchSize
    if (!rows.length) break
    counts.scanned += rows.length

    try {
      const result = await persist(supabase, rows, {
        dryRun: !apply,
        // Category membership does not change the application detail itself.
        // Avoid turning a bounded corpus repair into a revalidation backlog.
        enqueue: false,
      })
      counts.inserted += result.created || 0
      counts.updated += result.updated || 0
      counts.unchanged += (result.scanned || rows.length) - (result.changed || 0)
      for (const item of result.results || []) {
        const publicCategories = item.classification?.publicCategories || []
        if (publicCategories.length) counts.matched += 1
        for (const category of publicCategories) {
          categoryCounts[category] = (categoryCounts[category] || 0) + 1
        }
      }
    } catch (error) {
      counts.failed += rows.length
      failures.push({ cursor, rows: rows.length, error: error instanceof Error ? error.message : String(error) })
      break
    }

    cursor = rows.at(-1).id
    batchesCompleted += 1
    if (!lastBatchFull) break
  }

  const complete = failures.length === 0 && !lastBatchFull
  return {
    mode: apply ? "bounded-apply" : "read-only-audit",
    dryRun: !apply,
    batchSize: safeBatchSize,
    maxBatches: safeMaxBatches,
    batchesCompleted,
    startCursor: initialCursor,
    finalCursor: cursor,
    nextCursor: complete ? null : cursor,
    complete,
    counts,
    categoryCounts,
    failures,
  }
}

function argument(name, fallback = "") {
  const prefix = `--${name}=`
  return process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length) || fallback
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required")
  const output = argument("output", "artifacts/planning-public-category-reconciliation.json")
  const report = await runPlanningPublicCategoryReconciliation({
    supabase: createClient(url, key, { db: { retry: false } }),
    startCursor: argument("cursor", PUBLIC_CATEGORY_ZERO_UUID),
    batchSize: Number(argument("batch-size", String(PUBLIC_CATEGORY_MAX_BATCH_SIZE))),
    maxBatches: Number(argument("max-batches", "1")),
    apply: process.argv.includes("--apply"),
  })
  await mkdir(dirname(output), { recursive: true })
  await writeFile(output, `${JSON.stringify(report, null, 2)}\n`, "utf8")
  console.log(JSON.stringify(report, null, 2))
  if (report.failures.length) process.exitCode = 1
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main()
}
