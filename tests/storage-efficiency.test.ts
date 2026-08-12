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
