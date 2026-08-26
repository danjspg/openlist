import assert from "node:assert/strict"
import test from "node:test"

import {
  canonicalCaseUrl,
  mapAcpFeature,
  parseAcpCasePage,
  planningAuthorityCode,
} from "../lib/acp-appeals-source.mjs"

test("ACP planning authority names map to OpenList authority codes", () => {
  assert.equal(planningAuthorityCode("South Dublin County Council"), "SOUTHDUBLIN")
  assert.equal(planningAuthorityCode("Dún Laoghaire-Rathdown County Council"), "DLR")
  assert.equal(planningAuthorityCode("Kildare County Council"), "KILDARE")
  assert.equal(planningAuthorityCode("Unknown Authority"), null)
})

test("ACP ArcGIS features map source facts without inventing a local planning reference", () => {
  const mapped = mapAcpFeature({
    OBJECTID: 42,
    ABPCASEID: "PL06S.309055",
    DEVDESC: "Example development",
    DEVADDRESS: "Example address",
    LODGEDON: Date.UTC(2020, 11, 22),
    DECISION: "Grant permission with conditions",
    DECIDED_ON: Date.UTC(2021, 4, 25),
    LINKABPWEB: "",
    PLANINGATY: "South Dublin County Council",
    CATEGORY: "Planning",
    UPDATED_ON: Date.UTC(2021, 4, 26),
  })

  assert.ok(mapped)
  assert.equal(mapped?.acp_case_number, "PL06S.309055")
  assert.equal(mapped?.planning_authority_code, "SOUTHDUBLIN")
  assert.equal(mapped?.received_date, "2020-12-22")
  assert.equal(mapped?.decision_date, "2021-05-25")
  assert.equal(mapped?.decision, "Grant permission with conditions")
  assert.equal(mapped?.source_url, "https://www.pleanala.ie/en-ie/case/309055")
  assert.equal(Object.hasOwn(mapped!, "planning_authority_case_reference"), false)
})

test("official ACP case page parser extracts the planning-authority reference and case type", () => {
  const parsed = parseAcpCasePage(`
    <main>
      <h3>An Coimisiún Pleanála - Case reference: PL09.317471</h3>
      <p>Planning Authority Case Reference: 23423</p>
      <dl>
        <dt>Case type</dt>
        <dd>Planning Appeal</dd>
        <dt>Decision</dt>
        <dd>Refuse Permission</dd>
      </dl>
    </main>
  `)
  assert.equal(parsed.caseType, "Planning Appeal")
  assert.equal(parsed.planningAuthorityCaseReference, "23423")
})

test("ACP case URLs are canonicalised from a case number", () => {
  assert.equal(canonicalCaseUrl("PL09.309929"), "https://www.pleanala.ie/en-ie/case/309929")
})
