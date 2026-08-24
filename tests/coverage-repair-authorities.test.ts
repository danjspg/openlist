import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

import {
  corkAgileApplicationConfig,
  corkAgileCanonicalReference,
  corkAgileSourceApplicationId,
  corkAgileAuthorityConfig,
} from "../lib/cork-agile-authorities.mjs"
import {
  fetchKildarePlanningApplications,
  mapKildareApplication,
  parseKildareDate,
} from "../scripts/ingest-kildare-planning-applications.mjs"

async function source(path: string) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8")
}

test("Kildare official register rows map conservatively with council lifecycle fields", () => {
  const row = mapKildareApplication({
    FileNumber: "2660950",
    DateReceived: "21/08/2026",
    Type: "PERMISSION",
    DevelopmentDescription: "Construct an extension",
    DevelopmentAddress: "Naas, Co. Kildare",
    ApplicantName: "Test Applicant",
    ApplicationStatus: "NEW APPLICATION",
    Decision: null,
    DueDate: "16/10/2026",
    DecisionDateMO: "01/01/1900",
    GrantDate: "",
    FurtherInfoRequested: "",
    FurtherInfoReceived: "",
  })

  assert.equal(row?.reference, "2660950")
  assert.equal(row?.registration_date, "2026-08-21")
  assert.equal(row?.decision_due_date, "2026-10-16")
  assert.equal(row?.decision_date, null)
  assert.match(row?.source_url || "", /^https:\/\/www\.eplanning\.ie\/KildareCC\//)
  assert.equal(parseKildareDate("01/01/1900"), null)
})

test("Kildare fetch filters the council corpus to the requested bounded range", async () => {
  const fetchImpl = (async () => ({
    ok: true,
    json: async () => [
      { FileNumber: "2660419", DateReceived: "17/04/2026" },
      { FileNumber: "2660950", DateReceived: "21/08/2026" },
      { FileNumber: "bad/ref", DateReceived: "21/08/2026" },
    ],
  })) as unknown as typeof fetch
  const records = await fetchKildarePlanningApplications({
    from: new Date("2026-08-01T00:00:00Z"),
    to: new Date("2026-08-24T00:00:00Z"),
    fetchImpl,
  })
  assert.deepEqual(records.map((record) => record?.reference), ["2660950"])
})

test("Wexford uses its proven Agile client while retaining established canonical references", () => {
  const config = corkAgileAuthorityConfig("WEXFORD")
  assert.equal(config?.tenant, "wexford")
  assert.equal(config?.agileStartDate, "2026-06-01")
  assert.equal(corkAgileCanonicalReference(config, "20260987W"), "20260987")
  assert.equal(corkAgileCanonicalReference(config, "20260987"), "20260987")
  assert.equal(
    corkAgileSourceApplicationId(config, {
      source_application_id: 455493,
      source_url: "https://planning.agileapplications.ie/wexford/application-details/131700",
    }),
    131700
  )
  assert.equal(
    corkAgileApplicationConfig({
      local_authority_code: "WEXFORD",
      registration_date: "2026-06-01",
      source_url: null,
    })?.code,
    "WEXFORD"
  )
})

test("repaired authorities run before the broader daily active refresh and revalidate immediately", async () => {
  const [workflow, activeRefresh, watcher] = await Promise.all([
    source(".github/workflows/planning-active-refresh.yml"),
    source("scripts/refresh-active-planning-applications.mts"),
    source("lib/planning-alert-watch.mjs"),
  ])
  const repair = workflow.indexOf("Ingest recent Kildare, Wicklow, and Wexford applications")
  const revalidate = workflow.indexOf("Revalidate repaired authority planning pages")
  const broad = workflow.indexOf("Refresh active Planning applications")
  assert.ok(repair >= 0 && repair < revalidate && revalidate < broad)
  assert.match(workflow, /ingest-kildare-planning-applications\.mjs/)
  assert.match(workflow, /--days 180 --authority WICKLOW/)
  assert.match(workflow, /--authority WEXFORD/)
  assert.match(activeRefresh, /corkAgileAuthorityConfig\(localAuthorityCode\)/)
  assert.match(watcher, /corkAgileSourceApplicationId\(config, app\)/)
})
