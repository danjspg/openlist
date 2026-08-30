import assert from "node:assert/strict"
import test from "node:test"
import { readFile } from "node:fs/promises"
import { acquireBcmsPage, bcmsContentHash, replayBcmsProcessing } from "../lib/bcms-pipeline.mjs"

test("BCMS acquisition hashes canonically and advances only after durable storage", async () => {
  const calls: string[] = []
  const record = { _id: 12, CN_Number: "CN12", LocalAuthority: "Louth County Council" }
  const report = await acquireBcmsPage({
    cursor: "11",
    source: { async fetchPage() { calls.push("external"); return { rows: [record], endCursor: "12" } } },
    rawStore: { async store({ rows }: { rows: Array<Record<string, unknown>> }) { calls.push("stored"); assert.equal(rows[0]._openlist_content_hash, bcmsContentHash(record)); return { newOrChangedRows: 1 } } },
  })
  assert.deepEqual(calls, ["external", "stored"])
  assert.equal(report.endCursor, "12")
})

test("internal replay performs zero external requests and remains idempotent", async () => {
  const externalRequests = 0
  const normalized = new Set<string>()
  const links = new Set<string>()
  const processor = {
    async normalize() { normalized.add("raw-1"); return { processedRows: normalized.size === 1 ? 1 : 0 } },
    async match() { links.add("app-1:notice-1"); return { newlyLinked: links.size === 1 ? 1 : 0 } },
  }
  await replayBcmsProcessing({ processor, normaliseBatches: 1, matchBatches: 1 })
  await replayBcmsProcessing({ processor, normaliseBatches: 1, matchBatches: 1 })
  assert.equal(externalRequests, 0)
  assert.equal(normalized.size, 1)
  assert.equal(links.size, 1)
})

test("acquisition failure cannot be hidden by advancing the caller cursor", async () => {
  await assert.rejects(acquireBcmsPage({
    cursor: "20",
    source: { async fetchPage() { return { rows: [{ _id: 21 }], endCursor: "21" } } },
    rawStore: { async store() { throw new Error("durable write failed") } },
  }), /durable write failed/)
})

test("scheduled acquisition and internal replay remain independently rerunnable", async () => {
  const processScript = await readFile(new URL("../scripts/process-bcms-internal.mjs", import.meta.url), "utf8")
  const migration = await readFile(new URL("../supabase/migrations/20260830121000_add_incremental_bcms_pipeline.sql", import.meta.url), "utf8")
  assert.doesNotMatch(processScript, /fetch\s*\(/)
  assert.match(migration, /bcms_raw_record_versions/)
  assert.match(migration, /unique \(source_resource_id, source_record_id, content_hash\)/)
  assert.match(migration, /'acquisition_append','acquisition_audit','normalization','matching','notable_catchup','construction_catchup'/)
  assert.match(migration, /order by priority,id limit greatest\(1,least\(coalesce\(p_limit,200\),500\)\)/)
  assert.match(migration, /'acquisition_append',coalesce\(max\(source_row_id\),0\)::text/)
  assert.match(migration, /current_row\.source_payload <@ \(row - '_openlist_content_hash'\)/)
  assert.match(migration, /'baselined',bootstrap_count/)
  assert.match(migration, /processing_terminal=processing_attempts\+1>=8/)
  assert.match(migration, /openlist_bcms_requeue_raw_failures/)
  assert.match(migration, /notice_count=1 and unphased and has_completion/)
  assert.match(migration, /'completion_certificate_validated'/)
  assert.match(migration, /perform public\.openlist_bcms_refresh_construction_state\(stale_app\)/)
  assert.match(migration, /openlist_bcms_refresh_construction_batch/)
  assert.match(processScript, /openlist_bcms_refresh_construction_batch/)
})

test("changed-row audit is bounded, ordered and skips unchanged source revisions", async () => {
  const acquisition = await readFile(new URL("../scripts/acquire-bcms-incremental.mjs", import.meta.url), "utf8")
  const workflow = await readFile(new URL("../.github/workflows/bcms-incremental-acquisition.yml", import.meta.url), "utf8")
  assert.match(acquisition, /sort", "_id asc"/)
  assert.match(acquisition, /sameTimestamp\(sourceFreshnessAt, checkpoint\?\.source_freshness_at\)/)
  assert.match(acquisition, /Math\.min\(Number\(pages\) \|\| 1, 25\)/)
  assert.match(workflow, /--audit --limit=1000 --pages=10/)
})
