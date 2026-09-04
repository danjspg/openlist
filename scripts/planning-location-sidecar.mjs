function degreesToRadians(value) {
  return (value * Math.PI) / 180
}

function radiansToDegrees(value) {
  return (value * 180) / Math.PI
}

export function planningGridToWgs84(input) {
  const easting = Number(input?.grid_easting)
  const northing = Number(input?.grid_northing)

  if (
    !Number.isFinite(easting) ||
    !Number.isFinite(northing) ||
    easting < 400_000 ||
    easting > 800_000 ||
    northing < 450_000 ||
    northing > 1_000_000
  ) {
    return null
  }

  const a = 6_378_137
  const b = 6_356_752.314140356
  const latitudeOrigin = degreesToRadians(53.5)
  const longitudeOrigin = degreesToRadians(-8)
  const scale = 0.99982
  const falseEasting = 600_000
  const falseNorthing = 750_000
  const e2 = (a * a - b * b) / (a * a)
  const n = (a - b) / (a + b)
  let latitude = latitudeOrigin
  let meridionalArc = 0

  do {
    latitude = (northing - falseNorthing - meridionalArc) / (a * scale) + latitude
    const delta = latitude - latitudeOrigin
    const sum = latitude + latitudeOrigin
    meridionalArc =
      b *
      scale *
      ((1 + n + (5 / 4) * n ** 2 + (5 / 4) * n ** 3) * delta -
        (3 * n + 3 * n ** 2 + (21 / 8) * n ** 3) * Math.sin(delta) * Math.cos(sum) +
        ((15 / 8) * n ** 2 + (15 / 8) * n ** 3) * Math.sin(2 * delta) * Math.cos(2 * sum) -
        (35 / 24) * n ** 3 * Math.sin(3 * delta) * Math.cos(3 * sum))
  } while (Math.abs(northing - falseNorthing - meridionalArc) >= 0.00001)

  const sinLatitude = Math.sin(latitude)
  const cosLatitude = Math.cos(latitude)
  const tanLatitude = Math.tan(latitude)
  const nu = (a * scale) / Math.sqrt(1 - e2 * sinLatitude ** 2)
  const rho = (a * scale * (1 - e2)) / Math.pow(1 - e2 * sinLatitude ** 2, 1.5)
  const eta2 = nu / rho - 1
  const deltaEasting = easting - falseEasting
  const vii = tanLatitude / (2 * rho * nu)
  const viii =
    (tanLatitude / (24 * rho * nu ** 3)) *
    (5 + 3 * tanLatitude ** 2 + eta2 - 9 * tanLatitude ** 2 * eta2)
  const ix =
    (tanLatitude / (720 * rho * nu ** 5)) *
    (61 + 90 * tanLatitude ** 2 + 45 * tanLatitude ** 4)
  const x = 1 / (cosLatitude * nu)
  const xi =
    (1 / (cosLatitude * 6 * nu ** 3)) *
    (nu / rho + 2 * tanLatitude ** 2)
  const xii =
    (1 / (cosLatitude * 120 * nu ** 5)) *
    (5 + 28 * tanLatitude ** 2 + 24 * tanLatitude ** 4)
  const xiia =
    (1 / (cosLatitude * 5040 * nu ** 7)) *
    (61 + 662 * tanLatitude ** 2 + 1320 * tanLatitude ** 4 + 720 * tanLatitude ** 6)

  const resolvedLatitude =
    latitude -
    vii * deltaEasting ** 2 +
    viii * deltaEasting ** 4 -
    ix * deltaEasting ** 6
  const resolvedLongitude =
    longitudeOrigin +
    x * deltaEasting -
    xi * deltaEasting ** 3 +
    xii * deltaEasting ** 5 -
    xiia * deltaEasting ** 7

  const lat = radiansToDegrees(resolvedLatitude)
  const lng = radiansToDegrees(resolvedLongitude)
  return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null
}

export function planningLocationSidecarRows(rows, source = "ingestion") {
  const updatedAt = new Date().toISOString()
  return rows.flatMap((row) => {
    const coordinates = planningGridToWgs84(row)
    if (!row?.id || !coordinates) return []
    return [{
      application_id: row.id,
      grid_easting: Number(row.grid_easting),
      grid_northing: Number(row.grid_northing),
      location_geog: `SRID=4326;POINT(${coordinates.lng} ${coordinates.lat})`,
      source,
      updated_at: updatedAt,
    }]
  })
}

export async function upsertPlanningLocationSidecar(supabase, rows, label, source = "ingestion") {
  const sidecarRows = planningLocationSidecarRows(rows, source)
  if (sidecarRows.length === 0) return { attempted: 0, stored: 0 }

  const { error } = await supabase
    .from("planning_application_locations")
    .upsert(sidecarRows, { onConflict: "application_id" })

  if (error) {
    throw new Error(`${label}: Planning location sidecar upsert failed: ${error.message}`)
  }

  return { attempted: sidecarRows.length, stored: sidecarRows.length }
}
