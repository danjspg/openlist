import assert from "node:assert/strict"

function normaliseExportFeature(feature) {
  const attributes = feature.attributes || {}
  const geometry = feature.geometry || {}
  const reference = String(attributes.ApplicationNumber || "").trim()
  const authority = String(attributes.PlanningAuthority || "").trim()
  const easting = Number(geometry.x)
  const northing = Number(geometry.y)

  if (!reference || !authority || !Number.isFinite(easting) || !Number.isFinite(northing)) {
    return null
  }

  return {
    object_id: Number.isInteger(attributes.OBJECTID) ? attributes.OBJECTID : null,
    authority,
    reference,
    easting,
    northing,
  }
}

const valid = normaliseExportFeature({
  attributes: {
    OBJECTID: 123,
    PlanningAuthority: "Kildare County Council",
    ApplicationNumber: "2660631",
  },
  geometry: { x: 681234.5, y: 723456.7 },
})

assert.deepEqual(valid, {
  object_id: 123,
  authority: "Kildare County Council",
  reference: "2660631",
  easting: 681234.5,
  northing: 723456.7,
})

assert.equal(
  normaliseExportFeature({
    attributes: {
      PlanningAuthority: "Kildare County Council",
      ApplicationNumber: "2660631",
    },
    geometry: null,
  }),
  null
)

assert.equal(
  normaliseExportFeature({
    attributes: {
      PlanningAuthority: "",
      ApplicationNumber: "2660631",
    },
    geometry: { x: 681234.5, y: 723456.7 },
  }),
  null
)

console.log("National planning coordinate pipeline safety checks passed.")
