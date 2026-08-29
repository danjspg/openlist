import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

async function source(path: string) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8")
}

test("snapshot integrity distinguishes unavailable verification from a proven mismatch", async () => {
  const [script, workflow] = await Promise.all([
    source("scripts/verify-dataset-snapshots.mjs"),
    source(".github/workflows/openlist-data-integrity.yml"),
  ])
  assert.match(script, /openlist_planning_snapshot_integrity_facts/)
  assert.match(script, /openlist_ppr_snapshot_integrity_facts/)
  assert.match(script, /VERIFICATION_UNAVAILABLE/)
  assert.match(script, /VERIFIED_MISMATCH/)
  assert.match(workflow, /outputs\.classification == 'mismatch'/)
  assert.match(workflow, /dublin\)[\s\S]*?refresh-ppr-dublin-district-insights/)
  assert.match(workflow, /Verification-unavailable states are escalated without rebuilding derived data/)
})

test("historical progress and lifecycle audits use isolated bounded RPCs", async () => {
  const [progress, lifecycle, migration] = await Promise.all([
    source("scripts/report-historical-catchup-progress.mjs"),
    source("scripts/audit-planning-lifecycle-consistency.mjs"),
    source("supabase/migrations/20260829073000_bound_integrity_and_catchup_queries.sql"),
  ])
  assert.match(progress, /openlist_historical_catchup_progress_part/)
  assert.match(progress, /for \(const config of catchups\)/)
  assert.match(lifecycle, /openlist_planning_lifecycle_inconsistencies_for_check/)
  assert.match(lifecycle, /for \(const check of checks\)/)
  assert.match(migration, /set statement_timeout = '12s'/)
  assert.match(migration, /set statement_timeout = '10s'/)
  assert.match(migration, /planning_appeal_links_exact_high_idx/)
})
