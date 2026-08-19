import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"
import {
  authoritativeCorkProposal,
  isLikelyTruncatedCorkSearchProposal,
  parseCorkCouncilDate,
} from "../lib/cork-planning-source.mjs"

test("Cork date-only timestamps retain the council calendar date in summer and winter", () => {
  assert.equal(parseCorkCouncilDate("2026-06-15T00:00:00"), "2026-06-15")
  assert.equal(parseCorkCouncilDate("2026-12-15T00:00:00"), "2026-12-15")
  assert.equal(parseCorkCouncilDate("2026-06-15T00:00:00Z"), "2026-06-15")
  assert.equal(parseCorkCouncilDate("not-a-date"), null)
  assert.equal(parseCorkCouncilDate("2026-02-30T00:00:00"), null)
})

test("the Cork detail proposal supersedes its shortened search representation", () => {
  const short = "Permission for alterations and extensions to the existing dwelling. The proposed"
  const full = `${short} works include a rear extension and associated site works.`
  assert.equal(short.length, 80)
  assert.equal(isLikelyTruncatedCorkSearchProposal(short), true)
  assert.equal(authoritativeCorkProposal(short, full), full)
  assert.equal(authoritativeCorkProposal(short, null), short)
})

test("Cork Decision Due preparation uses the distinct detail field without adding requests", async () => {
  const importer = await readFile(
    new URL("../scripts/ingest-cork-planning-applications.mjs", import.meta.url),
    "utf8"
  )

  assert.match(importer, /decision_due_date: parseCorkCouncilDate\(row\.decisionDueDate\)/)
  assert.match(importer, /function decisionDueFromDetail\(detail, existingValue\)/)
  assert.match(importer, /detail\.decisionDueDate === null\) return null/)
  assert.match(importer, /detail\.decisionDueDate === undefined\) return existingValue/)
  assert.match(importer, /parseCorkCouncilDate\(detail\.decisionDueDate\) \|\| existingValue/)
  assert.match(
    importer,
    /!isLikelyTruncatedCorkSearchProposal\(record\.proposal\)[\s\S]*?continue[\s\S]*?fetchApplicationDetail\(/
  )
  assert.doesNotMatch(importer, /decision_due_date\s*:\s*parseCorkCouncilDate\(row\.decisionDate\)/)
  assert.match(importer, /preserveUnobservedFields: \["decision_due_date"\]/)
  assert.match(importer, /ACTIVE_CORK_DETAIL_STATUSES/)
  assert.match(importer, /shouldRefreshCorkDecisionDue\(record\)/)
  assert.match(importer, /Object\.hasOwn\(detail, "decisionDueDate"\)/)
})

test("Cork detail-only enrichment is bounded, dry-run by default, and race-safe", async () => {
  const script = await readFile(
    new URL("../scripts/enrich-cork-planning-decision-due.mjs", import.meta.url),
    "utf8"
  )
  assert.match(script, /const DEFAULT_LIMIT = 10/)
  assert.match(script, /const MAX_LIMIT = 50/)
  assert.match(script, /--reference/)
  assert.match(script, /--before-reference/)
  assert.match(script, /const apply = args\.includes\("--apply"\)/)
  assert.match(script, /\.is\("decision_due_date", null\)/)
  assert.match(script, /\.eq\("local_authority_code", AUTHORITY_CODE\)/)
  assert.match(script, /revalidation_pending: true/)
  assert.match(script, /\.is\("decision_due_date", null\)[\s\S]*?\.select\("id"\)/)
  assert.match(script, /ENOTFOUND|EAI_AGAIN/)
  assert.doesNotMatch(script, /count\s*:\s*"exact"|head:\s*true/)
})
