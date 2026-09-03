import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

async function source(path: string) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8")
}

test("snapshot integrity distinguishes unavailable verification from a proven mismatch", async () => {
  const [script, workflow, dublinWorkflow] = await Promise.all([
    source("scripts/verify-dataset-snapshots.mjs"),
    source(".github/workflows/openlist-data-integrity.yml"),
    source(".github/workflows/ppr-dublin-district-insights.yml"),
  ])
  assert.match(script, /openlist_planning_snapshot_integrity_facts/)
  assert.match(script, /openlist_ppr_snapshot_integrity_facts/)
  assert.match(script, /ppr-core/)
  assert.match(script, /ppr-dublin/)
  assert.match(script, /VERIFICATION_UNAVAILABLE/)
  assert.match(script, /VERIFIED_MISMATCH/)
  assert.match(workflow, /outputs\.classification == 'mismatch'/)
  assert.doesNotMatch(workflow, /refresh-ppr-dublin-district-insights/)
  assert.match(dublinWorkflow, /refresh-ppr-dublin-district-insights/)
  assert.match(dublinWorkflow, /group: ppr-maintenance/)
  assert.match(workflow, /Verification-unavailable states are escalated without rebuilding derived data/)
})

test("historical progress and lifecycle audits use isolated bounded RPCs", async () => {
  const [progress, lifecycle, migration] = await Promise.all([
    source("scripts/report-historical-catchup-progress.mjs"),
    source("scripts/audit-planning-lifecycle-consistency.mjs"),
    source("supabase/migrations/20260829072628_bound_integrity_and_catchup_queries.sql"),
  ])
  assert.match(progress, /openlist_historical_catchup_progress_part/)
  assert.match(progress, /for \(const config of catchups\)/)
  assert.match(lifecycle, /openlist_planning_lifecycle_inconsistencies_for_check/)
  assert.match(lifecycle, /for \(const check of LIFECYCLE_CHECKS\)/)
  assert.match(migration, /set statement_timeout = '12s'/)
  assert.match(migration, /set statement_timeout = '10s'/)
  assert.match(migration, /planning_appeal_links_exact_high_idx/)
})