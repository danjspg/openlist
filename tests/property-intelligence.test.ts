import assert from "node:assert/strict"
import test from "node:test"
import { wgs84ToPlanningGrid } from "../lib/eircode-planning-grid"
import {
  distanceInKilometres,
  extractEircode,
  matchPlanningLocation,
  planningGridToWgs84,
  planningReferenceFromSlug,
  planningReferenceSlug,
} from "../lib/property-intelligence"

test("planning reference slugs round-trip without exposing route separators", () => {
  const reference = "26/1638 A"
  const slug = planningReferenceSlug(reference)

  assert.match(slug, /^ref-[A-Za-z0-9_-]+$/)
  assert.equal(planningReferenceFromSlug(slug), reference)
  assert.equal(planningReferenceFromSlug("26/1638"), null)
})

test("location matching prefers the longest known locality and preserves Eircode context", () => {
  const match = matchPlanningLocation(
    {
      local_authority_code: "CORKCOCO",
      location: "2 Johnstown Park, Johnstown, Glounthaune, Co. Cork T45 PX70",
    },
    [
      { county: "Cork", areaSlug: "johnstown", areaLabel: "Johnstown", salesCount: 10, lastSaleDate: null },
      { county: "Cork", areaSlug: "glounthaune", areaLabel: "Glounthaune", salesCount: 10, lastSaleDate: null },
    ]
  )

  assert.equal(match.county, "Cork")
  assert.equal(match.locality, "Glounthaune")
  assert.equal(match.eircode, "T45 PX70")
  assert.equal(match.matchKind, "eircode")
})

test("ITM coordinates convert around their published origin and legacy grid is not guessed", () => {
  const origin = planningGridToWgs84({ grid_easting: 600_000, grid_northing: 750_000 })
  assert.ok(origin)
  assert.ok(Math.abs(origin.lat - 53.5) < 0.0001)
  assert.ok(Math.abs(origin.lng + 8) < 0.0001)
  assert.equal(planningGridToWgs84({ grid_easting: 151_387, grid_northing: 108_151 }), null)
})

test("WGS84 and ITM conversion round-trip closely enough for a 2 km candidate box", () => {
  const location = { lat: 51.915, lng: -8.18 }
  const grid = wgs84ToPlanningGrid(location)
  assert.ok(grid)
  const roundTrip = planningGridToWgs84({
    grid_easting: grid.easting,
    grid_northing: grid.northing,
  })
  assert.ok(roundTrip)
  assert.ok(distanceInKilometres(location, roundTrip) < 0.001)
})

test("distance helper returns useful geographic distance", () => {
  const distance = distanceInKilometres(
    { lat: 53.3498, lng: -6.2603 },
    { lat: 51.8985, lng: -8.4756 }
  )
  assert.ok(distance > 215 && distance < 225)
})

test("Eircode extraction normalises its space", () => {
  assert.equal(extractEircode("Main Street, D02X285"), "D02 X285")
  assert.equal(extractEircode("No postcode"), null)
})
