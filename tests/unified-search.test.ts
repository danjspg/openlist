import assert from "node:assert/strict"
import test from "node:test"
import type { PlanningApplication } from "../lib/planning"
import type { PprSale } from "../lib/ppr"
import {
  searchExactEircode,
  type ExactEircodeSearchDependencies,
} from "../lib/exact-eircode-search"

const pprFixtures: PprSale[] = [
  {
    id: "sale-old",
    eircode: "A65 F4E2",
    address_raw: "Example address",
    date_of_sale: "2020-03-01",
    price_eur: 250_000,
  },
  {
    id: "sale-new",
    eircode: "A65 F4E2",
    address_raw: "Example address",
    date_of_sale: "2025-08-01",
    price_eur: 400_000,
  },
]

const planningFixtures = [
  {
    id: "planning-match",
    eircode: "A65 F4E2",
    reference: "25/100",
    registration_date: "2025-04-02",
  },
] as PlanningApplication[]

function fixtureDependencies(calls: string[]): ExactEircodeSearchDependencies {
  return {
    async findPprSales(eircode) {
      calls.push(`ppr:${eircode}`)
      return pprFixtures.filter((sale) => sale.eircode === eircode)
    },
    async findPlanningApplications(eircode) {
      calls.push(`planning:${eircode}`)
      return planningFixtures.filter((application) => application.eircode === eircode)
    },
  }
}

test("spaced, compact and lowercase Eircode searches return identical exact results", async () => {
  const logicalResults = []

  for (const input of ["A65 F4E2", "A65F4E2", "a65 f4e2", "a65f4e2"]) {
    const calls: string[] = []
    const result = await searchExactEircode(input, fixtureDependencies(calls))
    logicalResults.push({
      saleIds: result.addresses.map((sale) => sale.id),
      planningIds: result.planningApplications.map((application) => application.id),
    })
    assert.deepEqual(calls.sort(), ["planning:A65 F4E2", "ppr:A65 F4E2"])
    assert.equal(result.eircode, "A65 F4E2")
    assert.deepEqual(result.places, [])
  }

  assert.deepEqual(logicalResults.slice(1), [logicalResults[0], logicalResults[0], logicalResults[0]])
  assert.deepEqual(logicalResults[0].saleIds, ["sale-new", "sale-old"])
  assert.deepEqual(logicalResults[0].planningIds, ["planning-match"])
})

test("valid absent Eircode returns an exact empty state without Places", async () => {
  const result = await searchExactEircode("D6W F2H3", fixtureDependencies([]))
  assert.equal(result.intent, "eircode")
  assert.equal(result.eircode, "D6W F2H3")
  assert.deepEqual(result.addresses, [])
  assert.deepEqual(result.planningApplications, [])
  assert.deepEqual(result.places, [])
})

test("invalid Eircode does not query either dataset", async () => {
  const calls: string[] = []
  const result = await searchExactEircode("A65 O4E2", fixtureDependencies(calls))
  assert.equal(result.intent, "invalid-eircode")
  assert.equal(result.eircode, null)
  assert.deepEqual(calls, [])
})
