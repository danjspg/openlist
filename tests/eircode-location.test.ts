import assert from "node:assert/strict"
import test from "node:test"
import {
  rankNearbyPprSales,
  resolveEircodeLocationContext,
} from "../lib/eircode-location"
import {
  EIRCODE_MULTI_MARKET_KEY_COUNT,
  EIRCODE_ROUTING_KEY_COUNT,
  EIRCODE_ROUTING_MARKET_COUNT,
  getEircodeRoutingMarkets,
} from "../lib/eircode-routing-markets"
import type { PlanningApplication } from "../lib/planning"
import type { PprSale } from "../lib/ppr"

function sale(overrides: Partial<PprSale> = {}): PprSale {
  return {
    id: overrides.id ?? "sale-1",
    date_of_sale: overrides.date_of_sale ?? "2025-01-01",
    address_raw: overrides.address_raw ?? "1 Example Street",
    price_eur: overrides.price_eur ?? 300_000,
    eircode: "P25 HX40",
    county: "Cork",
    locality: "Midleton",
    area_slug: "midleton",
    ...overrides,
  }
}

function planning(overrides: Partial<PlanningApplication> = {}) {
  return {
    id: "planning-1",
    local_authority: "Cork County Council",
    local_authority_code: "CORKCOCO",
    reference: "25/1",
    web_reference: null,
    application_type: null,
    proposal: null,
    location: "Midleton, Co. Cork, P25 HX40",
    eircode: "P25 HX40",
    applicant_name: null,
    agent_name: null,
    status: null,
    normalized_status: "unknown",
    decision_text: null,
    registration_date: "2025-02-01",
    valid_date: null,
    decision_date: null,
    decision_due_date: null,
    final_grant_date: null,
    expiry_date: null,
    further_information_requested_date: null,
    further_information_received_date: null,
    withdrawal_date: null,
    appeal_lodged_date: null,
    appeal_decision_date: null,
    appeal_decision_text: null,
    appeal_lodged_source: null,
    appeal_decision_source: null,
    dispatch_date: null,
    appeal_notify_date: null,
    ward: null,
    grid_reference: null,
    grid_easting: 587_769,
    grid_northing: 573_825,
    source_url: null,
    updated_at: null,
    ...overrides,
  } satisfies PlanningApplication
}

test("exact PPR coordinates take priority over exact planning coordinates", () => {
  const context = resolveEircodeLocationContext({
    eircode: "P25 HX40",
    pprSales: [sale({ lat: 51.9, lng: -8.17 })],
    planningApplications: [planning()],
  })

  assert.equal(context.source, "ppr-exact")
  assert.equal(context.coordinateSource, "ppr-exact")
  assert.equal(context.lat, 51.9)
  assert.equal(context.lng, -8.17)
  assert.equal(context.areaSlug, "midleton")
})

test("planning coordinates supplement an exact PPR area when counties agree", () => {
  const context = resolveEircodeLocationContext({
    eircode: "P25 HX40",
    pprSales: [sale({ lat: null, lng: null })],
    planningApplications: [planning()],
  })

  assert.equal(context.source, "ppr-exact")
  assert.equal(context.coordinateSource, "planning-exact")
  assert.ok(context.lat && context.lng)
  assert.equal(context.areaSlug, "midleton")
})

test("material PPR/planning county disagreement does not silently merge coordinates", () => {
  const context = resolveEircodeLocationContext({
    eircode: "P25 HX40",
    pprSales: [sale()],
    planningApplications: [
      planning({ local_authority: "Fingal County Council", local_authority_code: "FINGAL" }),
    ],
  })

  assert.equal(context.county, "Cork")
  assert.equal(context.coordinateSource, null)
  assert.equal(context.lat, null)
  assert.equal(context.confidence, "medium")
  assert.match(context.conflict ?? "", /disagree on county/)
})

test("multiple historic PPR records retain the most recent defensible area and flag anomalies", () => {
  const context = resolveEircodeLocationContext({
    eircode: "P25 HX40",
    pprSales: [
      sale({ id: "old", date_of_sale: "2020-01-01", locality: "Old Area", area_slug: "old-area" }),
      sale({ id: "new", date_of_sale: "2025-01-01", locality: "Midleton", area_slug: "midleton" }),
    ],
    planningApplications: [],
  })

  assert.equal(context.areaSlug, "midleton")
  assert.equal(context.locality, "Midleton")
  assert.equal(context.confidence, "medium")
  assert.match(context.conflict ?? "", /Historic PPR records/)
})

test("an absent exact Eircode may resolve only to explicitly broad routing-area context", () => {
  const routingSales = Array.from({ length: 10 }, (_, index) =>
    sale({ id: `routing-${index}`, eircode: `P25 A${index}AA` })
  )
  const context = resolveEircodeLocationContext({
    eircode: "P25 VVVV",
    pprSales: [],
    planningApplications: [],
    routingKeySales: routingSales,
  })

  assert.equal(context.source, "routing-key")
  assert.equal(context.contextLevel, "routing-area")
  assert.equal(context.confidence, "low")
  assert.equal(context.areaSlug, "midleton")
  assert.equal(context.lat, null)
  assert.equal(context.lng, null)
})

test("a verified routing market anchors fragmented P43 neighbourhood data to Carrigaline", () => {
  const neighbourhoods = [
    ["carrigaline", "Carrigaline"],
    ["herons-wood", "Herons Wood"],
    ["crosshaven", "Crosshaven"],
    ["church-rd", "Church Rd"],
    ["castle-heights", "Castle Heights"],
    ["ringaskiddy", "Ringaskiddy"],
  ] as const
  const routingSales = neighbourhoods.flatMap(([area_slug, locality], group) =>
    Array.from({ length: 4 }, (_, index) =>
      sale({
        id: `p43-${group}-${index}`,
        county: "Cork",
        area_slug,
        locality,
      })
    )
  )
  const context = resolveEircodeLocationContext({
    eircode: "P43 W082",
    pprSales: [],
    planningApplications: [],
    routingKeySales: routingSales,
  })

  assert.equal(context.source, "routing-key")
  assert.equal(context.contextLevel, "routing-area")
  assert.equal(context.county, "Cork")
  assert.equal(context.locality, "Carrigaline")
  assert.equal(context.areaSlug, "carrigaline")
  assert.equal(context.lat, null)
  assert.equal(context.lng, null)
})

test("the routing-market table covers all 139 routing keys", () => {
  assert.equal(EIRCODE_ROUTING_KEY_COUNT, 139)
  assert.equal(EIRCODE_ROUTING_MARKET_COUNT, 153)
  assert.equal(EIRCODE_MULTI_MARKET_KEY_COUNT, 8)
  assert.deepEqual(getEircodeRoutingMarkets("P43"), [
    {
      county: "Cork",
      locality: "Carrigaline",
      areaSlug: "carrigaline",
      label: "Carrigaline",
    },
  ])
  assert.equal(getEircodeRoutingMarkets("A63").length, 5)
  assert.equal(getEircodeRoutingMarkets("A82").length, 3)
})

test("a same-county multi-market routing key exposes choices without selecting a market", () => {
  const routingSales = Array.from({ length: 10 }, (_, index) =>
    sale({
      id: `a63-${index}`,
      county: "Wicklow",
      locality: null,
      area_slug: null,
    })
  )
  const context = resolveEircodeLocationContext({
    eircode: "A63 VVVV",
    pprSales: [],
    planningApplications: [],
    routingKeySales: routingSales,
  })

  assert.equal(context.source, "routing-key")
  assert.equal(context.county, "Wicklow")
  assert.equal(context.locality, null)
  assert.equal(context.areaSlug, null)
  assert.deepEqual(
    context.routingMarkets.map((market) => market.label),
    ["Delgany", "Greystones", "Kilcoole", "Newcastle", "Newtownmountkennedy"]
  )
})

test("a cross-county multi-market routing key exposes choices without selecting a county", () => {
  const routingSales = [
    ...Array.from({ length: 5 }, (_, index) =>
      sale({
        id: `a82-meath-${index}`,
        county: "Meath",
        locality: null,
        area_slug: null,
      })
    ),
    ...Array.from({ length: 5 }, (_, index) =>
      sale({
        id: `a82-cavan-${index}`,
        county: "Cavan",
        locality: null,
        area_slug: null,
      })
    ),
  ]
  const context = resolveEircodeLocationContext({
    eircode: "A82 VVVV",
    pprSales: [],
    planningApplications: [],
    routingKeySales: routingSales,
  })

  assert.equal(context.source, "routing-key")
  assert.equal(context.county, null)
  assert.equal(context.locality, null)
  assert.equal(context.areaSlug, null)
  assert.deepEqual(
    context.routingMarkets.map((market) => market.label),
    ["Kells", "Kingscourt", "Virginia"]
  )
})

test("a curated routing market is rejected when live county evidence disagrees", () => {
  const routingSales = Array.from({ length: 10 }, (_, index) =>
    sale({
      id: `conflict-${index}`,
      county: "Dublin",
      locality: null,
      area_slug: null,
    })
  )
  const context = resolveEircodeLocationContext({
    eircode: "P43 W082",
    pprSales: [],
    planningApplications: [],
    routingKeySales: routingSales,
  })

  assert.equal(context.source, "routing-key")
  assert.equal(context.county, "Dublin")
  assert.equal(context.areaSlug, null)
})

test("an Eircode without exact or defensible routing data stays unresolved", () => {
  const context = resolveEircodeLocationContext({
    eircode: "D6W F2H3",
    pprSales: [],
    planningApplications: [],
    routingKeySales: [],
  })

  assert.equal(context.source, "none")
  assert.equal(context.contextLevel, "unresolved")
  assert.equal(context.county, null)
})

test("nearby PPR ranking filters by distance, removes exact rows and enforces the limit", () => {
  const origin = { lat: 53.3498, lng: -6.2603 }
  const candidates = Array.from({ length: 20 }, (_, index) =>
    sale({
      id: `candidate-${index}`,
      lat: origin.lat + index * 0.0001,
      lng: origin.lng,
      date_of_sale: `2025-01-${String((index % 28) + 1).padStart(2, "0")}`,
    })
  )
  candidates.push(sale({ id: "far-away", lat: 51.8985, lng: -8.4756 }))

  const ranked = rankNearbyPprSales(
    candidates,
    origin,
    new Set(["candidate-0"]),
    2,
    10
  )

  assert.equal(ranked.length, 10)
  assert.ok(ranked.every((candidate) => candidate.distanceKm <= 2))
  assert.ok(!ranked.some((candidate) => candidate.id === "candidate-0"))
  assert.ok(!ranked.some((candidate) => candidate.id === "far-away"))
  assert.ok(ranked.every((candidate, index) => index === 0 || ranked[index - 1].distanceKm <= candidate.distanceKm))
})
