import test from "node:test"
import assert from "node:assert/strict"
import {
  planningGridToWgs84,
  planningLocationSidecarRows,
} from "../scripts/planning-location-sidecar.mjs"

test("converts plausible ITM coordinates to WGS84", () => {
  const coordinates = planningGridToWgs84({ grid_easting: 550818, grid_northing: 547560 })
  assert.ok(coordinates)
  assert.ok(coordinates.lat > 51 && coordinates.lat < 53)
  assert.ok(coordinates.lng > -11 && coordinates.lng < -6)
})

test("builds sidecar rows only for usable coordinates", () => {
  const rows = planningLocationSidecarRows([
    { id: "a", grid_easting: 550818, grid_northing: 547560 },
    { id: "b", grid_easting: null, grid_northing: null },
  ])
  assert.equal(rows.length, 1)
  assert.equal(rows[0].application_id, "a")
  assert.match(rows[0].location_geog, /^SRID=4326;POINT\(-?\d/)
  assert.equal(rows[0].source, "ingestion")
})
