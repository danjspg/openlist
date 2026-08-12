import assert from "node:assert/strict"
import test from "node:test"
import {
  planningEircodeFieldsFromSources,
  planningEircodeFromSources,
  pprEircodeFields,
} from "../lib/eircode-ingestion.mjs"

test("PPR ingestion writes canonical Eircode and Routing Key fields", () => {
  assert.deepEqual(pprEircodeFields("a65f4e2"), {
    eircode: "A65 F4E2",
    eircode_prefix: "A65",
  })
  assert.deepEqual(pprEircodeFields("A65 F4E2"), {
    eircode: "A65 F4E2",
    eircode_prefix: "A65",
  })
})

test("PPR ingestion does not fabricate missing or invalid Eircodes", () => {
  assert.deepEqual(pprEircodeFields(""), {
    eircode: null,
    eircode_prefix: null,
  })
  assert.deepEqual(pprEircodeFields("A65 O4E2"), {
    eircode: null,
    eircode_prefix: null,
  })
})

test("planning ingestion extracts Cork location Eircodes", () => {
  assert.equal(
    planningEircodeFromSources("Main Street, Carrigaline, Co. Cork P43Y2P1"),
    "P43 Y2P1"
  )
  assert.equal(planningEircodeFromSources("Main Street, Carrigaline"), null)
})

test("national planning ingestion prefers the source postcode then checks address", () => {
  assert.equal(
    planningEircodeFromSources("d18x62w", "Address without a code"),
    "D18 X62W"
  )
  assert.equal(
    planningEircodeFromSources("not supplied", "Development at A96XY17"),
    "A96 XY17"
  )
  assert.equal(
    planningEircodeFromSources("invalid", "Address without a code"),
    null
  )
})

test("planning ingestion stores the exact routing key for indexed fallbacks", () => {
  assert.deepEqual(
    planningEircodeFieldsFromSources("T12 W082", "Cork city"),
    { eircode: "T12 W082", eircode_prefix: "T12" }
  )
  assert.deepEqual(planningEircodeFieldsFromSources("No Eircode here"), {
    eircode: null,
    eircode_prefix: null,
  })
})
