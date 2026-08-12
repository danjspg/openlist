import assert from "node:assert/strict"
import test from "node:test"
import {
  getEircodeFallbackPlan,
  planningLocationContainsLocality,
  planningLocationMatchesRoutingMarket,
} from "../lib/eircode-fallback"
import { resolveEircodeLocationContext } from "../lib/eircode-location"
import type { PprSale } from "../lib/ppr"

const nationalCases = [
  {
    name: "Cork centre and southside",
    eircode: "T12 VVVV",
    county: "Cork",
    label: "Cork (centre and southside)",
    localityFallback: null,
  },
  {
    name: "Dublin 6",
    eircode: "D06 VVVV",
    county: "Dublin",
    label: "Dublin 6",
    localityFallback: "Dublin 6",
  },
  {
    name: "Kinsale",
    eircode: "P17 VVVV",
    county: "Cork",
    label: "Kinsale",
    localityFallback: "Kinsale",
  },
  {
    name: "Castlebar",
    eircode: "F23 VVVV",
    county: "Mayo",
    label: "Castlebar",
    localityFallback: "Castlebar",
  },
] as const

for (const fixture of nationalCases) {
  test(`${fixture.name} uses the narrowest verified market before its routing key`, () => {
    const context = resolveEircodeLocationContext({
      eircode: fixture.eircode,
      pprSales: [],
      planningApplications: [],
      routingKeySales: Array.from({ length: 10 }, (_, index) => ({
        id: `${fixture.eircode}-${index}`,
        date_of_sale: "2026-01-01",
        address_raw: `${fixture.name} address ${index}`,
        price_eur: 300_000,
        county: fixture.county,
        locality: fixture.label,
        area_slug: fixture.label.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
      } satisfies PprSale)),
    })
    const plan = getEircodeFallbackPlan(context)

    assert.ok(plan)
    assert.equal(plan.routingKey, fixture.eircode.slice(0, 3))
    assert.equal(plan.label, fixture.label)
    if (fixture.eircode.startsWith("T12")) {
      assert.deepEqual(plan.salesScope, {
        kind: "routing-key",
        routingKey: fixture.eircode.slice(0, 3),
      })
    } else {
      assert.deepEqual(plan.salesScope, {
        kind: "area",
        county: fixture.county,
        areaSlug: fixture.label.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
      })
    }
    assert.equal(plan.planningLocalityFallback, fixture.localityFallback)
  })
}

test("P43 uses the verified Carrigaline market instead of all P43 towns", () => {
  const context = resolveEircodeLocationContext({
    eircode: "P43 W083",
    pprSales: [],
    planningApplications: [],
    routingKeySales: Array.from({ length: 10 }, (_, index) => ({
      id: `p43-${index}`,
      date_of_sale: "2026-01-01",
      address_raw: `P43 address ${index}`,
      price_eur: 300_000,
      county: "Cork",
      locality: index < 5 ? "Carrigaline" : "Ringaskiddy",
      area_slug: index < 5 ? "carrigaline" : "ringaskiddy",
    } satisfies PprSale)),
  })

  assert.deepEqual(getEircodeFallbackPlan(context)?.salesScope, {
    kind: "area",
    county: "Cork",
    areaSlug: "carrigaline",
  })
})

test("generic county/city names are not accepted as locality fallbacks", () => {
  assert.equal(planningLocationContainsLocality("Ballincollig, Co. Cork", "Cork"), true)

  const context = resolveEircodeLocationContext({
    eircode: "T12 VVVV",
    pprSales: [],
    planningApplications: [],
    routingKeySales: Array.from({ length: 10 }, () => ({
      county: "Cork",
      locality: "Cork",
      area_slug: "cork",
    })),
  })
  assert.equal(getEircodeFallbackPlan(context)?.planningLocalityFallback, null)
})

test("whole-locality filtering does not confuse Dublin 6 with Dublin 60", () => {
  assert.equal(
    planningLocationContainsLocality("Rathmines, Dublin 6, D06 VVVV", "Dublin 6"),
    true
  )
  assert.equal(
    planningLocationContainsLocality("Example Road, Dublin 60", "Dublin 6"),
    false
  )
  assert.equal(
    planningLocationContainsLocality("Example Road, Dublin 6W", "Dublin 6"),
    false
  )
})

test("P43 planning fallback excludes other towns in the same routing key", () => {
  const routingAreas = [
    { locality: "Carrigaline", area_slug: "carrigaline" },
    { locality: "Myrtleville", area_slug: "myrtleville" },
    { locality: "Riverstick", area_slug: "riverstick" },
    { locality: "Ringaskiddy", area_slug: "ringaskiddy" },
  ]

  assert.equal(
    planningLocationMatchesRoutingMarket(
      "Main Street, Carrigaline, Cork, P43 VVVV",
      "Carrigaline",
      "carrigaline",
      routingAreas
    ),
    true
  )
  for (const locality of ["Myrtleville", "Riverstick", "Ringaskiddy"]) {
    assert.equal(
      planningLocationMatchesRoutingMarket(
        `${locality}, Carrigaline, Cork, P43 VVVV`,
        "Carrigaline",
        "carrigaline",
        routingAreas
      ),
      false
    )
  }
})
