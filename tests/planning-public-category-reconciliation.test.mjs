import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"
import {
  PUBLIC_CATEGORY_MAX_BATCHES,
  PUBLIC_CATEGORY_MAX_BATCH_SIZE,
  PUBLIC_CATEGORY_MAX_SCANNED_ROWS,
  PUBLIC_CATEGORY_ZERO_UUID,
  runPlanningPublicCategoryReconciliation,
} from "../scripts/reconcile-planning-public-categories.mjs"
import {
  addPublicCategoryAuditRow,
  emptyPublicCategoryAuditCounts,
  finalisePublicCategoryAuditCounts,
} from "../scripts/audit-planning-public-category-corpus.mjs"

function applicationRows(prefix, count) {
  return Array.from({ length: count }, (_, index) => ({
    id: `${prefix}-${String(index + 1).padStart(4, "0")}`,
    proposal: index % 2 ? "Construction of four padel courts" : "Single house extension",
  }))
}

function harness(pages) {
  const reads = []
  const persistCalls = []
  let pageIndex = 0
  const supabase = {
    from(table) {
      assert.equal(table, "planning_applications")
      const call = { table }
      reads.push(call)
      return {
        select(value) { call.select = value; return this },
        gt(column, value) { call.gt = [column, value]; return this },
        order(column, options) { call.order = [column, options]; return this },
        async limit(value) {
          call.limit = value
          return { data: pages[pageIndex++] || [], error: null }
        },
      }
    },
  }
  const persist = async (_client, rows, options) => {
    persistCalls.push({ rows, options })
    const matched = rows.filter((row) => row.proposal.includes("padel"))
    return {
      scanned: rows.length,
      created: matched.length,
      updated: 0,
      changed: matched.length,
      results: rows.map((row) => ({
        classification: {
          publicCategories: row.proposal.includes("padel") ? ["padel"] : [],
        },
      })),
    }
  }
  return { supabase, persist, reads, persistCalls }
}

test("public-category audit is bounded, read-only and resumable", async () => {
  const mock = harness(Array.from({ length: 10 }, (_, index) => applicationRows(`batch-${index + 1}`, 250)))
  const events = []
  let clock = 1_000
  const report = await runPlanningPublicCategoryReconciliation({
    supabase: mock.supabase,
    persist: mock.persist,
    batchSize: PUBLIC_CATEGORY_MAX_BATCH_SIZE,
    maxBatches: PUBLIC_CATEGORY_MAX_BATCHES,
    now: () => (clock += 25),
    log: (event) => events.push(event),
  })
  assert.equal(report.batchSize, PUBLIC_CATEGORY_MAX_BATCH_SIZE)
  assert.equal(report.maxBatches, PUBLIC_CATEGORY_MAX_BATCHES)
  assert.equal(mock.reads[0].gt[1], PUBLIC_CATEGORY_ZERO_UUID)
  assert.equal(mock.reads[1].gt[1], "batch-1-0250")
  assert.ok(mock.persistCalls.every((call) => call.options.dryRun === true))
  assert.ok(mock.persistCalls.every((call) => call.options.enqueue === false))
  assert.equal(report.counts.scanned, 2_500)
  assert.equal(report.counts.scanned, PUBLIC_CATEGORY_MAX_SCANNED_ROWS)
  assert.equal(report.counts.matched, 1_250)
  assert.equal(report.counts.inserted, 1_250)
  assert.equal(report.counts.updated, 0)
  assert.equal(report.counts.unchanged, 1_250)
  assert.equal(report.nextCursor, "batch-10-0250")
  assert.equal(report.complete, false)
  assert.equal(report.elapsedMs, 275)
  assert.equal(events[0].event, "start")
  assert.equal(events[0].maximumScannedRows, 2_500)
  assert.equal(events.at(-1).safeCursor, "batch-10-0250")
  assert.equal(events.at(-1).counts.scanned, 2_500)
})

test("unsafe bounds and invalid cursors are refused before the first read", async () => {
  for (const options of [
    { batchSize: 251, maxBatches: 1 },
    { batchSize: 0, maxBatches: 1 },
    { batchSize: 2.5, maxBatches: 1 },
    { batchSize: 250, maxBatches: 11 },
    { batchSize: 250, maxBatches: Number.NaN },
    { batchSize: 250, maxBatches: 1, startCursor: "not-a-uuid" },
  ]) {
    const mock = harness([])
    await assert.rejects(
      runPlanningPublicCategoryReconciliation({ supabase: mock.supabase, persist: mock.persist, ...options }),
      /must be|cursor must/
    )
    assert.equal(mock.reads.length, 0)
  }
})

test("explicit apply remains one bounded idempotent upsert path", async () => {
  const mock = harness([applicationRows("final", 3)])
  const report = await runPlanningPublicCategoryReconciliation({
    supabase: mock.supabase,
    persist: mock.persist,
    startCursor: "11111111-1111-4111-8111-111111111111",
    batchSize: 25,
    maxBatches: 1,
    apply: true,
  })
  assert.deepEqual(mock.reads[0].gt, ["id", "11111111-1111-4111-8111-111111111111"])
  assert.equal(mock.persistCalls[0].options.dryRun, false)
  assert.equal(report.mode, "bounded-apply")
  assert.equal(report.counts.scanned, 3)
  assert.equal(report.counts.matched, 1)
  assert.equal(report.counts.inserted, 1)
  assert.equal(report.counts.unchanged, 2)
  assert.equal(report.complete, true)
  assert.equal(report.nextCursor, null)
})

test("a failed batch stops without advancing the safe cursor", async () => {
  const mock = harness([applicationRows("failed", 10), applicationRows("never", 10)])
  const safeCursor = "22222222-2222-4222-8222-222222222222"
  const events = []
  const report = await runPlanningPublicCategoryReconciliation({
    supabase: mock.supabase,
    persist: async () => { throw new Error("simulated failure") },
    startCursor: safeCursor,
    batchSize: 10,
    maxBatches: 2,
    apply: true,
    log: (event) => events.push(event),
  })
  assert.equal(mock.reads.length, 1)
  assert.equal(report.counts.scanned, 10)
  assert.equal(report.counts.failed, 10)
  assert.equal(report.finalCursor, safeCursor)
  assert.equal(report.nextCursor, safeCursor)
  assert.equal(events.at(-1).event, "failure")
  assert.equal(events.at(-1).safeCursor, safeCursor)
})

test("read-only corpus counts distinguish represented and exact membership", () => {
  const counts = emptyPublicCategoryAuditCounts()
  addPublicCategoryAuditRow(counts, { proposal: "Construction of four padel courts" }, ["press"])
  addPublicCategoryAuditRow(counts, { proposal: "Construction of two padel courts" }, undefined)
  addPublicCategoryAuditRow(counts, { proposal: "Construction of six padel courts" }, ["padel"])
  finalisePublicCategoryAuditCounts(counts)
  assert.deepEqual(counts.padel, {
    qualifying: 3,
    represented: 2,
    exactMembership: 1,
    missing: 1,
    exactMembershipMismatches: 1,
    repairsRequired: 2,
    membershipRepairNeeded: 2,
  })
})

test("committed rollout baseline covers every public category and balances", async () => {
  const baseline = JSON.parse(await readFile(
    new URL("../docs/planning-public-category-baseline-2026-08-31.json", import.meta.url),
    "utf8"
  ))
  assert.equal(baseline.mode, "read-only")
  assert.equal(baseline.scanned, 391_563)
  assert.equal(Object.keys(baseline.categories).length, 15)
  for (const [slug, count] of Object.entries(baseline.categories)) {
    assert.equal(count.missing, count.qualifying - count.represented, slug)
    assert.equal(count.exactMembershipMismatches, count.represented - count.exactMembership, slug)
    assert.equal(count.repairsRequired, count.missing + count.exactMembershipMismatches, slug)
  }
})
