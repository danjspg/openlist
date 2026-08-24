import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

import {
  CORK_CITY_AGILE_START_DATE,
  corkAgileApplicationConfig,
  corkAgileApplicationUrl,
  corkAgileAuthorityConfig,
} from "../lib/cork-agile-authorities.mjs"

async function source(path: string) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8")
}

test("Cork City uses the official Agile client and tenant from the migration date", () => {
  const config = corkAgileAuthorityConfig("cork-city")
  assert.deepEqual(config, {
    code: "CORKCITY",
    name: "Cork City Council",
    slug: "cork-city",
    tenant: "corkcity",
    agileStartDate: "2025-11-26",
  })
  assert.equal(CORK_CITY_AGILE_START_DATE, "2025-11-26")
  assert.match(
    corkAgileApplicationUrl(config, "26/44866") || "",
    /^https:\/\/planning\.agileapplications\.ie\/corkcity\/search-applications\/results\?criteria=/
  )
})

test("transition-era Cork City applications retain their established source", () => {
  assert.equal(
    corkAgileApplicationConfig({
      local_authority_code: "CORKCITY",
      registration_date: "2025-11-25",
      source_url: "https://example.gov.ie/legacy",
    }),
    null
  )
  assert.equal(
    corkAgileApplicationConfig({
      local_authority_code: "CORKCITY",
      registration_date: "2025-11-26",
      source_url: null,
    })?.code,
    "CORKCITY"
  )
  assert.equal(
    corkAgileApplicationConfig({
      local_authority_code: "CORKCITY",
      registration_date: "2025-11-20",
      source_url: "https://planning.agileapplications.ie/corkcity/search-applications/results",
    })?.code,
    "CORKCITY"
  )
})

test("Cork City is wired into ingestion, daily refresh, detail refresh, and alert watching", async () => {
  const [importer, activeRefresh, detailRefresh, watcher, dailyWorkflow, weeklyWorkflow] =
    await Promise.all([
      source("scripts/ingest-cork-planning-applications.mjs"),
      source("scripts/refresh-active-planning-applications.mts"),
      source("scripts/refresh-cork-active-details.mts"),
      source("lib/planning-alert-watch.mjs"),
      source(".github/workflows/planning-active-refresh.yml"),
      source(".github/workflows/planning-refresh.yml"),
    ])

  assert.match(importer, /--authority must be CORKCOCO\/cork or CORKCITY\/cork-city/)
  assert.match(importer, /preserveWeakerFields: PRESERVE_WEAKER_SOURCE_FIELDS/)
  assert.match(activeRefresh, /corkAgileApplicationConfig\(candidate\)/)
  assert.match(activeRefresh, /CORK_CITY_AGILE_START_DATE/)
  assert.match(detailRefresh, /corkAgileApplicationConfig\(candidate\)/)
  assert.match(watcher, /const corkConfig = corkAgileApplicationConfig\(app\)/)
  assert.match(watcher, /"x-client": config\.code/)
  assert.match(dailyWorkflow, /ingest-cork-planning-applications\.mjs --authority CORKCITY/)
  assert.ok(
    dailyWorkflow.indexOf("Ingest recent Cork City applications") <
      dailyWorkflow.indexOf("Revalidate changed Cork City planning pages") &&
      dailyWorkflow.indexOf("Revalidate changed Cork City planning pages") <
        dailyWorkflow.indexOf("Refresh active Planning applications")
  )
  assert.match(weeklyWorkflow, /ingest-cork-planning-applications\.mjs --authority CORKCITY/)
})
