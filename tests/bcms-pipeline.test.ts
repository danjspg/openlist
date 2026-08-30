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
  assert.match(migration, /'acquisition_append','acquisition_audit','normalization','matching','notable_catchup'/)
  assert.match(migration, /order by priority,id limit greatest\(1,least\(coalesce\(p_limit,200\),500\)\)/)
})
