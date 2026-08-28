import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"
import {
  ZERO_UUID,
  normaliseResumeCursor,
  runPlanningNotableReconciliation,
} from "../scripts/reconcile-planning-notable-classification.mjs"

function rows(prefix, count) {
  return Array.from({ length: count }, (_, index) => ({
    id: `${prefix}-${String(index + 1).padStart(4, "0")}`,
    local_authority_code: index % 2 ? "CORKCOCO" : "DUBLINCITY",
  }))
}

function harness(pages, { notablePerBatch = 0 } = {}) {
  const rpcCalls = []
  const persistCalls = []
  let pageIndex = 0
  const supabase = {
    async rpc(name, parameters) {
      rpcCalls.push({ name, parameters })
      return { data: pages[pageIndex++] || [], error: null }
    },
  }
  const persist = async (_client, batch, options) => {
    persistCalls.push({ batch, options })
    const notable = Math.min(notablePerBatch, batch.length)
    return {
      scanned: batch.length,
      notable,
      changed: notable,
      created: notable,
      updated: 0,
      results: batch.map((application, index) => ({
        application,
        classification: {
          notable: index < notable,
          categories: index < notable ? ["energy"] : [],
        },
      })),
    }
  }
  return { supabase, persist, rpcCalls, persistCalls }
}

test("blank validation cursor starts from the zero UUID and remains read-only", async () => {
  assert.equal(normaliseResumeCursor(""), ZERO_UUID)
  const mock = harness([rows("final", 3)])
  const report = await runPlanningNotableReconciliation({
    supabase: mock.supabase,
    persist: mock.persist,
    startCursor: "",
    validate: true,
    apply: true,
    batchSize: 250,
    maxBatches: 100,
  })

  assert.equal(report.startCursor, ZERO_UUID)
  assert.equal(mock.rpcCalls[0].parameters.p_after, ZERO_UUID)
  assert.equal(mock.rpcCalls[0].parameters.p_full_window, true)
  assert.equal(report.dryRun, true)
  assert.equal(mock.persistCalls[0].options.dryRun, true)
})

test("supplied validation cursor is passed to the first bounded RPC call", async () => {
  const cursor = "78d43701-8e1c-4394-841e-ef1cf4a9af7f"
  const mock = harness([rows("continued", 2)])
  const report = await runPlanningNotableReconciliation({
    supabase: mock.supabase,
    persist: mock.persist,
    startCursor: cursor,
    validate: true,
    batchSize: 250,
    maxBatches: 100,
  })

  assert.equal(report.startCursor, cursor)
  assert.equal(mock.rpcCalls[0].parameters.p_after, cursor)
})

test("a full 100-batch validation result is partial and exposes its next cursor", async () => {
  const pages = Array.from({ length: 100 }, (_, index) => rows(`batch-${index + 1}`, 250))
  const mock = harness(pages, { notablePerBatch: 13 })
  const report = await runPlanningNotableReconciliation({
    supabase: mock.supabase,
    persist: mock.persist,
    validate: true,
    batchSize: 250,
    maxBatches: 100,
  })

  assert.equal(report.totalRowsScanned, 25_000)
  assert.equal(report.totalStructurallyNotable, 1_300)
  assert.equal(report.batchesCompleted, 100)
  assert.equal(report.complete, false)
  assert.equal(report.nextCursor, "batch-100-0250")
  assert.equal(report.remainingWork, "resume required")
  assert.equal(report.dryRun, true)
})

test("continuation starts strictly after the previous report cursor", async () => {
  const previousCursor = "batch-100-0250"
  const mock = harness([rows("continuation", 250), rows("final", 4)])
  const report = await runPlanningNotableReconciliation({
    supabase: mock.supabase,
    persist: mock.persist,
    startCursor: previousCursor,
    validate: true,
    batchSize: 250,
    maxBatches: 100,
  })

  assert.equal(mock.rpcCalls[0].parameters.p_after, previousCursor)
  assert.equal(mock.rpcCalls[1].parameters.p_after, "continuation-0250")
  assert.equal(report.startCursor, previousCursor)
})

test("a final short batch reports complete with no resume cursor", async () => {
  const mock = harness([rows("final", 17)], { notablePerBatch: 2 })
  const report = await runPlanningNotableReconciliation({
    supabase: mock.supabase,
    persist: mock.persist,
    validate: true,
    batchSize: 250,
    maxBatches: 100,
  })

  assert.equal(report.totalRowsScanned, 17)
  assert.equal(report.totalStructurallyNotable, 2)
  assert.equal(report.batchesCompleted, 1)
  assert.equal(report.complete, true)
  assert.equal(report.nextCursor, null)
  assert.equal(report.remainingWork, "complete")
  assert.equal(report.dryRun, true)
})

test("workflow validate branch forwards the cursor and cannot enable apply", async () => {
  const workflow = await readFile(
    new URL("../.github/workflows/planning-notable-classification.yml", import.meta.url),
    "utf8"
  )
  const validateBranch = workflow.match(/if \[\[ "\$RUN_MODE" == "validate" \]\]; then([\s\S]*?)elif/)?.[1] || ""
  assert.match(validateBranch, /--validate/)
  assert.match(validateBranch, /--full-window/)
  assert.match(validateBranch, /--batch-size=250/)
  assert.match(validateBranch, /--max-batches=100/)
  assert.match(validateBranch, /--cursor="\$RESUME_CURSOR"/)
  assert.doesNotMatch(validateBranch, /--apply/)
  assert.doesNotMatch(validateBranch, /APPLY_RECONCILIATION/)
})
