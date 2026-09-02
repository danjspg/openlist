import assert from "node:assert/strict"
import test from "node:test"
import { readFile } from "node:fs/promises"
import {
  MAINTENANCE_OUTCOMES,
  classifyDatabaseVerificationFailure,
} from "../lib/maintenance-outcomes.mjs"
import {
  auditPlanningLifecycleConsistency,
  boundedAuditLimit,
} from "../scripts/audit-planning-lifecycle-consistency.mjs"
import {
  boundedInteger,
  runAppealProcessing,
} from "../scripts/process-planning-appeals.mjs"

function response({ status = 200, json = [], text = "" } = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => json,
    text: async () => text,
  }
}

test("57014 is unavailable, never a verified mismatch", () => {
  assert.equal(classifyDatabaseVerificationFailure({
    status: 500,
    body: JSON.stringify({ code: "57014", message: "canceling statement due to statement timeout" }),
  }), MAINTENANCE_OUTCOMES.UNAVAILABLE)
})

test("lifecycle audit stops after unavailable verification and preserves prior facts", async () => {
  let calls = 0
  const report = await auditPlanningLifecycleConsistency({
    supabaseUrl: "https://example.invalid",
    serviceRoleKey: "test-key",
    limit: 25,
    fetchImpl: async () => {
      calls += 1
      if (calls === 1) return response({ json: [] })
      return response({ status: 500, text: '{"code":"57014","message":"statement timeout"}' })
    },
  })

  assert.equal(report.outcome, MAINTENANCE_OUTCOMES.UNAVAILABLE)
  assert.equal(calls, 2)
  assert.deepEqual(report.checks_run, ["APPEAL_DECIDED_STILL_APPEALED"])
  assert.deepEqual(report.checks_unavailable, ["APPEAL_DATE_ORDER_ERROR"])
  assert.equal(report.high_count, 0)
})

test("lifecycle audit reports positively verified inconsistencies as mismatch", async () => {
  let calls = 0
  const report = await auditPlanningLifecycleConsistency({
    supabaseUrl: "https://example.invalid",
    serviceRoleKey: "test-key",
    fetchImpl: async () => {
      calls += 1
      return response({ json: calls === 3 ? [{ severity: "high", anomaly_type: "ACP_DECISION_STATE_MISMATCH" }] : [] })
    },
  })
  assert.equal(report.outcome, MAINTENANCE_OUTCOMES.MISMATCH)
  assert.equal(report.high_count, 1)
  assert.equal(calls, 4)
})

test("a later unavailable check cannot erase an already verified high mismatch", async () => {
  let calls = 0
  const report = await auditPlanningLifecycleConsistency({
    supabaseUrl: "https://example.invalid",
    serviceRoleKey: "test-key",
    fetchImpl: async () => {
      calls += 1
      if (calls === 1) return response({ json: [{ severity: "high", anomaly_type: "KNOWN_MISMATCH" }] })
      return response({ status: 503, text: "temporarily unavailable" })
    },
  })
  assert.equal(report.outcome, MAINTENANCE_OUTCOMES.MISMATCH)
  assert.equal(report.high_count, 1)
  assert.equal(report.checks_unavailable.length, 1)
})

test("maintenance bounds reject unsafe values instead of clamping", () => {
  assert.equal(boundedAuditLimit(), 500)
  assert.throws(() => boundedAuditLimit("501"), /between 1 and 500/)
  assert.equal(boundedInteger("BATCH", undefined, { defaultValue: 25, maximum: 50 }), 25)
  assert.throws(() => boundedInteger("BATCH", "51", { defaultValue: 25, maximum: 50 }), /between 1 and 50/)
})

test("ACP processing is bounded, sequential and leaves remaining work resumable", async () => {
  let calls = 0
  const supabase = {
    rpc: async (_name, args) => {
      calls += 1
      assert.equal(args.p_limit, 25)
      return { data: { processed: 25, failed: 0, remaining: 100 - calls * 25 }, error: null }
    },
  }
  const report = await runAppealProcessing({ supabase, batchSize: 25, maxBatches: 2, log: () => {} })
  assert.equal(calls, 2)
  assert.equal(report.maximumRows, 50)
  assert.equal(report.totalProcessed, 50)
  assert.equal(report.remaining, 50)
  assert.equal(report.complete, false)
  assert.equal(report.resumable, true)
  assert.equal(report.outcome, MAINTENANCE_OUTCOMES.HEALTHY)
})

test("ACP processing timeout stops immediately without losing queue resume semantics", async () => {
  let calls = 0
  const supabase = {
    rpc: async () => {
      calls += 1
      if (calls === 1) return { data: { processed: 10, failed: 0, remaining: 30 }, error: null }
      return { data: null, error: { message: "57014 canceling statement due to statement timeout" } }
    },
  }
  const report = await runAppealProcessing({ supabase, batchSize: 10, maxBatches: 10, log: () => {} })
  assert.equal(calls, 2)
  assert.equal(report.totalProcessed, 10)
  assert.equal(report.remaining, 30)
  assert.equal(report.resumable, true)
  assert.equal(report.outcome, MAINTENANCE_OUTCOMES.UNAVAILABLE)
})

test("ACP processing refuses a zero-progress loop", async () => {
  const supabase = { rpc: async () => ({ data: { processed: 0, failed: 0, remaining: 4 }, error: null }) }
  const report = await runAppealProcessing({ supabase, batchSize: 10, maxBatches: 10, log: () => {} })
  assert.equal(report.outcome, MAINTENANCE_OUTCOMES.ERROR)
  assert.match(report.detail, /zero progress/i)
})

test("ACP processing stops on the first batch that reports failed rows", async () => {
  let calls = 0
  const supabase = {
    rpc: async () => {
      calls += 1
      return { data: { processed: 9, failed: 1, remaining: 20 }, error: null }
    },
  }
  const report = await runAppealProcessing({ supabase, batchSize: 10, maxBatches: 10, log: () => {} })
  assert.equal(calls, 1)
  assert.equal(report.outcome, MAINTENANCE_OUTCOMES.ERROR)
  assert.equal(report.totalFailed, 1)
})

test("internal ACP replay uses persisted queue data and never performs acquisition", async () => {
  const [processor, historicalWorkflow] = await Promise.all([
    readFile(new URL("../scripts/process-planning-appeals.mjs", import.meta.url), "utf8"),
    readFile(new URL("../.github/workflows/planning-appeals-historical-catchup.yml", import.meta.url), "utf8"),
  ])
  assert.doesNotMatch(processor, /\bfetch\s*\(|planning\.agile|pleanala\.ie|openlist_requeue_matchable_unlinked/)
  assert.match(processor, /openlist_process_acp_appeal_batch/)
  assert.match(processor, /acp_internal_processing/)
  assert.match(historicalWorkflow, /process_only:/)
  assert.match(historicalWorkflow, /ACP_PROCESS_BATCH_SIZE: "25"/)
  assert.match(historicalWorkflow, /ACP_PROCESS_MAX_BATCHES: "10"/)
  assert.match(historicalWorkflow, /group: openlist-db-maintenance/)
})
