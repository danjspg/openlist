import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import path from "node:path"
import test from "node:test"

const root = process.cwd()

test("an unchanged PPR source does not churn derived tables", async () => {
  const refresh = await readFile(path.join(root, "scripts/refresh-ppr.mjs"), "utf8")
  const unchangedBranch = refresh.match(
    /if \(newRecords\.length === 0\) \{([\s\S]*?)process\.exit\(0\)/
  )?.[1]

  assert.ok(unchangedBranch)
  assert.doesNotMatch(unchangedBranch, /refreshDerivedPprTables/)
  assert.match(unchangedBranch, /skipping their rebuild/)
})

test("storage migration keeps active area and Eircode indexes", async () => {
  const migration = await readFile(
    path.join(
      root,
      "supabase/migrations/20260812224500_drop_redundant_ppr_indexes.sql"
    ),
    "utf8"
  )

  assert.doesNotMatch(migration, /drop index if exists public\.ppr_sales_area_slug_idx/)
  assert.doesNotMatch(migration, /drop index if exists public\.ppr_sales_eircode_prefix_idx/)
  assert.match(migration, /autovacuum_vacuum_scale_factor = 0\.02/)
})

test("historical primary rows are protected from former free-tier retention", async () => {
  const [workflow, nationalImporter, trimScript] = await Promise.all([
    readFile(path.join(root, ".github/workflows/planning-refresh.yml"), "utf8"),
    readFile(
      path.join(root, "scripts/ingest-national-planning-applications.mjs"),
      "utf8"
    ),
    readFile(path.join(root, "scripts/trim-ppr-sales.mjs"), "utf8"),
  ])

  assert.doesNotMatch(workflow, /--prune/)
  assert.doesNotMatch(nationalImporter, /\.from\("planning_applications"\)\s*\.delete\(\)/)
  assert.doesNotMatch(trimScript, /\.from\("ppr_sales"\)/)
  assert.match(trimScript, /historical trimming is disabled/i)
})

test("planning imports omit raw payloads unless explicitly requested", async () => {
  const [cork, national] = await Promise.all([
    readFile(
      path.join(root, "scripts/ingest-cork-planning-applications.mjs"),
      "utf8"
    ),
    readFile(
      path.join(root, "scripts/ingest-national-planning-applications.mjs"),
      "utf8"
    ),
  ])

  assert.doesNotMatch(cork, /source_payload:\s*row/)
  assert.match(national, /storePayload \? \{ source_payload: row \} : \{\}/)
})

test("planning upserts split bounded batches after a statement timeout", async () => {
  const { upsertPlanningBatch } = await import("../scripts/planning-upsert.mjs")
  const batchSizes: number[] = []
  const supabase = {
    from(table: string) {
      assert.equal(table, "planning_applications")
      return {
        async upsert(batch: unknown[]) {
          batchSizes.push(batch.length)
          return batchSizes.length === 1
            ? { error: { code: "57014", message: "statement timeout" } }
            : { error: null }
        },
      }
    },
  }

  await upsertPlanningBatch(
    supabase,
    Array.from({ length: 100 }, (_, index) => ({ index })),
    "test authority"
  )

  assert.deepEqual(batchSizes, [100, 50, 50])
})

test("current PPR refresh replaces its cached annual source file", async () => {
  const refresh = await readFile(path.join(root, "scripts/refresh-ppr.mjs"), "utf8")
  assert.match(refresh, /download-ppr-csvs\.mjs", "--force"/)
})

test("historical planning status refresh is bounded, fair, and covers Cork", async () => {
  const [workflow, refresh, migration, boundedMigration, cork] = await Promise.all([
    readFile(path.join(root, ".github/workflows/planning-refresh.yml"), "utf8"),
    readFile(
      path.join(root, "scripts/refresh-historical-planning-statuses.mjs"),
      "utf8"
    ),
    readFile(
      path.join(
        root,
        "supabase/migrations/20260813120000_prepare_full_history_backfills.sql"
      ),
      "utf8"
    ),
    readFile(
      path.join(
        root,
        "supabase/migrations/20260814003000_bound_planning_status_candidates.sql"
      ),
      "utf8"
    ),
    readFile(
      path.join(root, "scripts/ingest-cork-planning-applications.mjs"),
      "utf8"
    ),
  ])

  assert.match(workflow, /refresh-historical-planning-statuses\.mjs/)
  assert.match(refresh, /DEFAULT_BUCKET_LIMIT.*12/)
  assert.match(refresh, /CORK_COUNTY_CODE/)
  assert.match(refresh, /ingest-cork-planning-applications\.mjs/)
  assert.match(refresh, /ingest-national-planning-applications\.mjs/)
  assert.match(migration, /last_source_checked_at asc nulls first/)
  assert.match(
    migration,
    /count\(\*\) filter \(where e\.last_source_checked_at is null\) > 0 then null/
  )
  assert.match(migration, /appeal_decision_date is null/)
  assert.match(migration, /final_grant_date is null/)
  assert.match(migration, /decision_date >= current_date - 180/)
  assert.match(boundedMigration, /planning_applications_unresolved_recheck_idx/)
  assert.match(boundedMigration, /planning_applications_recent_decision_recheck_idx/)
  assert.equal(boundedMigration.match(/limit 6000/g)?.length, 2)
  assert.match(boundedMigration, /last_source_checked_at asc nulls first/)
  assert.match(cork, /PLANNING_DEFAULT_RANGE_DAYS \|\| 90/)
})
