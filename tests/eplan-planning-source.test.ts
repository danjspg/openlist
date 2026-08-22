import assert from "node:assert/strict"
import test from "node:test"

import {
  buildEplanApplicationUrl,
  parseEplanApplicationHtml,
  parseIrishDate,
} from "../lib/eplan-planning-source.mjs"

const detail = `
  <table><tr><th>File Number:</th><td>2660190</td></tr>
  <tr><th>Decision Due Date:</th><td>25/08/2026</td></tr>
  <tr><th>Further Info Requested:</th><td>28/04/2026</td>
  <th>Further Info Received:</th><td>29/07/2026</td></tr>
  <tr><th>Withdrawn Date:</th><td>&nbsp;</td><th>Appeal Date:</th><td>01/08/2026</td></tr></table>`

test("ePlan parser reads structured lifecycle dates and blank values", () => {
  const result = parseEplanApplicationHtml(detail, "2660190")
  assert.equal(result.ok, true)
  if (!result.ok) return
  assert.equal(result.further_information_requested_date, "2026-04-28")
  assert.equal(result.further_information_received_date, "2026-07-29")
  assert.equal(result.decision_due_date, "2026-08-25")
  assert.equal(result.withdrawal_date, null)
  assert.equal(result.appeal_lodged_date, "2026-08-01")
})

test("ePlan parser rejects malformed dates and reference mismatches", () => {
  assert.equal(parseIrishDate("31/02/2026"), null)
  assert.deepEqual(parseEplanApplicationHtml(detail, "2660191"), {
    ok: false,
    reason: "reference_mismatch",
    fileNumber: "2660190",
  })
})

test("only verified authority paths build ePlan URLs", () => {
  assert.equal(
    buildEplanApplicationUrl("KERRY", "2660190"),
    "https://www.eplanning.ie/KerryCC/AppFileRefDetails/2660190/0"
  )
  assert.equal(buildEplanApplicationUrl("CORKCOCO", "26/1556"), null)
  assert.equal(
    buildEplanApplicationUrl("MAYO", "2660504"),
    "https://www.eplanning.ie/MayoCC/AppFileRefDetails/2660504/0"
  )
  assert.equal(
    buildEplanApplicationUrl("LIMERICK", "2660675"),
    "https://www.eplanning.ie/LimerickCCC/AppFileRefDetails/2660675/0"
  )
})
