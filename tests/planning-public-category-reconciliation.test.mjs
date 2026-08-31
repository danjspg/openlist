import assert from "node:assert/strict"
import test from "node:test"
import {
  PUBLIC_CATEGORY_MAX_BATCHES,
  PUBLIC_CATEGORY_MAX_BATCH_SIZE,
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
  const report = await runPlanningPublicCategoryReconciliation({
    supabase: mock.supabase,
    persist: mock.persist,
    batchSize: 999,
    maxBatches: 99,
  })
  assert.equal(report.batchSize, PUBLIC_CATEGORY_MAX_BATCH_SIZE)
  assert.equal(report.maxBatches, PUBLIC_CATEGORY_MAX_BATCHES)
  assert.equal(mock.reads[0].gt[1], PUBLIC_CATEGORY_ZERO_UUID)
  assert.equal(mock.reads[1].gt[1], "batch-1-0250")
  assert.ok(mock.persistCalls.every((call) => call.options.dryRun === true))
  assert.ok(mock.persistCalls.every((call) => call.options.enqueue === false))
  assert.equal(report.counts.scanned, 2_500)
  assert.equal(report.counts.matched, 1_250)
  assert.equal(report.counts.inserted, 1_250)
  assert.equal(report.counts.updated, 0)
  assert.equal(report.counts.unchanged, 1_250)
  assert.equal(report.nextCursor, "batch-10-0250")
  assert.equal(report.complete, false)
})

test("explicit apply remains one bounded idempotent upsert path", async () => {
  const mock = harness([applicationRows("final", 3)])
  const report = await runPlanningPublicCategoryReconciliation({
    supabase: mock.supabase,
    persist: mock.persist,
    startCursor: "safe-cursor",
    batchSize: 25,
    maxBatches: 1,
    apply: true,
  })
  assert.deepEqual(mock.reads[0].gt, ["id", "safe-cursor"])
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
  const report = await runPlanningPublicCategoryReconciliation({
    supabase: mock.supabase,
    persist: async () => { throw new Error("simulated failure") },
    startCursor: "safe-cursor",
    batchSize: 10,
    maxBatches: 2,
    apply: true,
  })
  assert.equal(mock.reads.length, 1)
  assert.equal(report.counts.scanned, 10)
  assert.equal(report.counts.failed, 10)
  assert.equal(report.finalCursor, "safe-cursor")
  assert.equal(report.nextCursor, "safe-cursor")
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
    membershipRepairNeeded: 2,
  })
})
