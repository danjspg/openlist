import assert from "node:assert/strict"
import { mkdtemp, readdir, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import test from "node:test"
import {
  readSerialProgress,
  runSerialPlanningPublicCategoryReconciliation,
  writeSerialProgressAtomically,
} from "../scripts/run-planning-public-category-reconciliation.mjs"

const ZERO = "00000000-0000-0000-0000-000000000000"
const cursor = (value) => `00000000-0000-4000-8000-${String(value).padStart(12, "0")}`

function report(startCursor, endCursor, { apply = true, complete = false, failed = 0 } = {}) {
  return {
    mode: apply ? "bounded-apply" : "read-only-audit",
    dryRun: !apply,
    batchSize: 250,
    maxBatches: 10,
    maximumScannedRows: 2_500,
    batchesCompleted: complete ? 1 : 10,
    startCursor,
    finalCursor: endCursor,
    nextCursor: complete ? null : endCursor,
    complete,
    elapsedMs: 1250,
    counts: {
      scanned: complete ? 63 : 2_500,
      matched: 100,
      inserted: 12,
      updated: 8,
      unchanged: complete ? 43 : 2_480,
      failed,
    },
    failures: failed ? [{ cursor: startCursor, error: "simulated" }] : [],
  }
}

async function temporaryState(t) {
  const directory = await mkdtemp(join(tmpdir(), "openlist-category-driver-"))
  t.after(() => rm(directory, { recursive: true, force: true }))
  return { directory, statePath: join(directory, "state.json") }
}

test("serial driver advances exact cursors and honours three-run canary", async (t) => {
  const { statePath } = await temporaryState(t)
  const starts = []
  const health = []
  const pauses = []
  const ends = [cursor(1), cursor(2), cursor(3), cursor(4)]
  const result = await runSerialPlanningPublicCategoryReconciliation({
    statePath,
    startCursor: ZERO,
    maxRuns: 3,
    pauseMs: 20_000,
    apply: true,
    confirmed: true,
    runTranche: async ({ startCursor, apply }) => {
      starts.push(startCursor)
      return report(startCursor, ends[starts.length - 1], { apply })
    },
    healthCheck: async ({ state }) => health.push(state.lastSuccessfulCursor),
    sleep: async (milliseconds) => pauses.push(milliseconds),
    log: () => {},
  })
  assert.deepEqual(starts, [ZERO, cursor(1), cursor(2)])
  assert.deepEqual(health, [cursor(1), cursor(2), cursor(3)])
  assert.deepEqual(pauses, [20_000, 20_000])
  assert.equal(result.runsThisExecution, 3)
  assert.equal(result.state.completedTranches, 3)
  assert.equal(result.state.lastSuccessfulCursor, cursor(3))
  assert.equal(result.state.totalScanned, 7_500)
  assert.equal(result.state.totalInserted, 36)
})

test("serial driver resumes from atomically persisted cursor and totals", async (t) => {
  const { statePath } = await temporaryState(t)
  const first = await runSerialPlanningPublicCategoryReconciliation({
    statePath,
    startCursor: ZERO,
    maxRuns: 1,
    pauseMs: 0,
    apply: true,
    confirmed: true,
    runTranche: async ({ startCursor }) => report(startCursor, cursor(10)),
    log: () => {},
  })
  assert.equal(first.state.lastSuccessfulCursor, cursor(10))

  let resumedFrom
  const second = await runSerialPlanningPublicCategoryReconciliation({
    statePath,
    maxRuns: 1,
    pauseMs: 0,
    apply: true,
    confirmed: true,
    runTranche: async ({ startCursor }) => {
      resumedFrom = startCursor
      return report(startCursor, cursor(11), { complete: true })
    },
    log: () => {},
  })
  assert.equal(resumedFrom, cursor(10))
  assert.equal(second.state.complete, true)
  assert.equal(second.state.completedTranches, 2)
  assert.equal(second.state.totalScanned, 2_563)
  await assert.rejects(
    runSerialPlanningPublicCategoryReconciliation({
      statePath,
      startCursor: ZERO,
      maxRuns: 1,
      pauseMs: 0,
      apply: true,
      confirmed: true,
      runTranche: async () => { throw new Error("must not run") },
    }),
    /does not match saved cursor/
  )
})

test("serial driver rejects zero progress without persisting advancement", async (t) => {
  const { statePath } = await temporaryState(t)
  await assert.rejects(
    runSerialPlanningPublicCategoryReconciliation({
      statePath,
      startCursor: ZERO,
      maxRuns: 2,
      pauseMs: 0,
      apply: true,
      confirmed: true,
      runTranche: async ({ startCursor }) => ({
        ...report(startCursor, startCursor),
        counts: { ...report(startCursor, startCursor).counts, scanned: 0 },
      }),
      log: () => {},
    }),
    /zero-progress/
  )
  assert.equal(await readSerialProgress(statePath), null)
})

test("serial driver stops on a failed tranche at the last successful state", async (t) => {
  const { statePath } = await temporaryState(t)
  let calls = 0
  await assert.rejects(
    runSerialPlanningPublicCategoryReconciliation({
      statePath,
      startCursor: ZERO,
      maxRuns: 5,
      pauseMs: 0,
      apply: true,
      confirmed: true,
      runTranche: async ({ startCursor }) => {
        calls += 1
        return calls === 1
          ? report(startCursor, cursor(20))
          : report(startCursor, cursor(21), { failed: 250 })
      },
      sleep: async () => {},
      log: () => {},
    }),
    /tranche failed/
  )
  assert.equal(calls, 2)
  const saved = await readSerialProgress(statePath)
  assert.equal(saved.lastSuccessfulCursor, cursor(20))
  assert.equal(saved.completedTranches, 1)
  assert.equal(saved.totalScanned, 2_500)
})

test("serial driver stops after a failed health probe with its successful cursor persisted", async (t) => {
  const { statePath } = await temporaryState(t)
  let calls = 0
  await assert.rejects(
    runSerialPlanningPublicCategoryReconciliation({
      statePath,
      startCursor: ZERO,
      maxRuns: 5,
      pauseMs: 0,
      apply: true,
      confirmed: true,
      runTranche: async ({ startCursor }) => {
        calls += 1
        return report(startCursor, cursor(25))
      },
      healthCheck: async () => { throw new Error("Data API health probe returned HTTP 503") },
      sleep: async () => {},
      log: () => {},
    }),
    /health probe returned HTTP 503/
  )
  assert.equal(calls, 1)
  const saved = await readSerialProgress(statePath)
  assert.equal(saved.lastSuccessfulCursor, cursor(25))
  assert.equal(saved.completedTranches, 1)
  assert.equal(saved.totalScanned, 2_500)
})

test("atomic progress replacement leaves one valid state file", async (t) => {
  const { directory, statePath } = await temporaryState(t)
  const state = {
    version: 1,
    mode: "audit",
    complete: false,
    lastSuccessfulCursor: ZERO,
    nextCursor: ZERO,
    completedTranches: 0,
    totalScanned: 0,
    totalInserted: 0,
    totalUpdated: 0,
    totalUnchanged: 0,
    updatedAt: "2026-08-31T21:30:00.000Z",
  }
  await writeSerialProgressAtomically(statePath, state)
  await writeSerialProgressAtomically(statePath, {
    ...state,
    lastSuccessfulCursor: cursor(30),
    nextCursor: cursor(30),
    completedTranches: 1,
    totalScanned: 2_500,
    updatedAt: "2026-08-31T21:31:00.000Z",
  })
  assert.equal((await readSerialProgress(statePath)).lastSuccessfulCursor, cursor(30))
  assert.deepEqual(await readdir(directory), ["state.json"])
})

test("apply mode requires explicit confirmation before any tranche", async (t) => {
  const { statePath } = await temporaryState(t)
  let called = false
  await assert.rejects(
    runSerialPlanningPublicCategoryReconciliation({
      statePath,
      maxRuns: 1,
      pauseMs: 0,
      apply: true,
      confirmed: false,
      runTranche: async () => { called = true },
    }),
    /explicit confirmation/
  )
  assert.equal(called, false)
})
