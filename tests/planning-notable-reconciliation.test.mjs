import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"
import {
  ZERO_UUID,
  normaliseResumeCursor,
  runPlanningNotableApplyFull,
  runPlanningNotableReconciliation,
} from "../scripts/reconcile-planning-notable-classification.mjs"

function rows(prefix, count) {
  return Array.from({ length: count }, (_, index) => ({
    id: `${prefix}-${String(index + 1).padStart(4, "0")}`,
    local_authority_code: index % 2 ? "CORKCOCO" : "DUBLINCITY",
  }))
}

function harness(pages, { notablePerBatch = 0, failPersistCall = 0 } = {}) {
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
    if (failPersistCall && persistCalls.length === failPersistCall) {
      throw new Error("simulated persistence failure")
    }
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

test("apply-full requires explicit confirmation before the first RPC", async () => {
  const mock = harness([rows("never-read", 250)])
  await assert.rejects(
    runPlanningNotableApplyFull({
      supabase: mock.supabase,
      persist: mock.persist,
      apply: true,
      confirmed: false,
    }),
    /requires explicit confirmation/
  )
  assert.equal(mock.rpcCalls.length, 0)
  assert.equal(mock.persistCalls.length, 0)

  await assert.rejects(
    runPlanningNotableApplyFull({
      supabase: mock.supabase,
      persist: mock.persist,
      apply: false,
      confirmed: true,
    }),
    /apply=true/
  )
  assert.equal(mock.rpcCalls.length, 0)
})

test("apply-full persists and carries cursors across bounded chunks until complete", async () => {
  const mock = harness([rows("chunk-one", 250), rows("final", 7)], {
    notablePerBatch: 3,
  })
  const report = await runPlanningNotableApplyFull({
    supabase: mock.supabase,
    persist: mock.persist,
    confirmed: true,
    apply: true,
    batchSize: 250,
    batchesPerChunk: 1,
    maxChunks: 5,
  })

  assert.equal(mock.rpcCalls.length, 2)
  assert.equal(mock.rpcCalls[0].parameters.p_after, ZERO_UUID)
  assert.equal(mock.rpcCalls[1].parameters.p_after, "chunk-one-0250")
  assert.ok(mock.persistCalls.every((call) => call.options.dryRun === false))
  assert.equal(report.mode, "active-recent-apply-full")
  assert.equal(report.dryRun, false)
  assert.equal(report.chunksCompleted, 2)
  assert.equal(report.batchesCompleted, 2)
  assert.equal(report.totalRowsScanned, 257)
  assert.equal(report.totalStructurallyNotable, 6)
  assert.equal(report.newNotableRows, 6)
  assert.equal(report.materiallyChangedRows, 6)
  assert.equal(report.complete, true)
  assert.equal(report.finalCursor, "final-0007")
  assert.equal(report.nextCursor, null)
})

test("apply-full stops on a failed batch and preserves the last safe cursor", async () => {
  const mock = harness(
    [rows("safe", 250), rows("failed", 250), rows("must-not-run", 10)],
    { notablePerBatch: 2, failPersistCall: 2 }
  )
  const report = await runPlanningNotableApplyFull({
    supabase: mock.supabase,
    persist: mock.persist,
    confirmed: true,
    apply: true,
    batchSize: 250,
    batchesPerChunk: 1,
    maxChunks: 5,
  })

  assert.equal(mock.rpcCalls.length, 2)
  assert.equal(mock.persistCalls.length, 2)
  assert.equal(report.failures.length, 1)
  assert.match(report.failures[0].error, /simulated persistence failure/)
  assert.equal(report.batchesCompleted, 1)
  assert.equal(report.totalRowsScanned, 250)
  assert.equal(report.finalCursor, "safe-0250")
  assert.equal(report.nextCursor, "safe-0250")
  assert.equal(report.complete, false)
  assert.equal(report.remainingWork, "resume required")
})

test("apply-full can resume from the safe cursor after a failure", async () => {
  const safeCursor = "safe-0250"
  const mock = harness([rows("retried", 250), rows("final", 4)], {
    notablePerBatch: 1,
  })
  const report = await runPlanningNotableApplyFull({
    supabase: mock.supabase,
    persist: mock.persist,
    startCursor: safeCursor,
    confirmed: true,
    apply: true,
    batchSize: 250,
    batchesPerChunk: 1,
    maxChunks: 5,
  })

  assert.equal(report.startCursor, safeCursor)
  assert.equal(mock.rpcCalls[0].parameters.p_after, safeCursor)
  assert.equal(report.complete, true)
  assert.equal(report.finalCursor, "final-0004")
})

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

test("canonical workflow owns deterministic reconciliation and scheduled sweep remains bounded", async () => {
  const workflow = await readFile(
    new URL("../.github/workflows/planning-notable-classification.yml", import.meta.url),
    "utf8"
  )
  const applyFullBranch = workflow.match(/elif \[\[ "\$RUN_MODE" == "apply-full" \]\]; then([\s\S]*?)elif/)?.[1] || ""
  assert.match(workflow, /options: \[validate, reconcile, apply-full\]/)
  assert.match(workflow, /group: openlist-db-maintenance/)
  assert.doesNotMatch(workflow, /reconcile-planning-public-categories\.mjs/)
  assert.match(workflow, /confirm_apply_full:/)
  assert.match(applyFullBranch, /CONFIRM_APPLY_FULL/)
  assert.match(applyFullBranch, /exit 1/)
  assert.match(applyFullBranch, /--apply-full/)
  assert.match(applyFullBranch, /--confirm-apply-full/)
  assert.match(applyFullBranch, /--apply/)
  assert.match(applyFullBranch, /--full-window/)
  assert.match(applyFullBranch, /--batch-size=250/)
  assert.match(applyFullBranch, /--cursor="\$RESUME_CURSOR"/)

  const sweepBranch = workflow.match(/elif \[\[ "\$RUN_MODE" == "sweep" \]\]; then([\s\S]*?)else/)?.[1] || ""
  assert.match(sweepBranch, /--recent-changed-days=3 --batch-size=250 --max-batches=8 --apply/)
  assert.doesNotMatch(sweepBranch, /--full-window/)
  assert.doesNotMatch(sweepBranch, /--apply-full/)
})
