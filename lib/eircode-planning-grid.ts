export function wgs84ToPlanningGrid(input: { lat: number; lng: number }) {
  if (
    !Number.isFinite(input.lat) ||
    !Number.isFinite(input.lng) ||
    input.lat < 51 ||
    input.lat > 56 ||
    input.lng < -11 ||
    input.lng > -5
  ) {
    return null
  }

  const a = 6_378_137
  const b = 6_356_752.314140356
  const latitude = degreesToRadians(input.lat)
  const longitude = degreesToRadians(input.lng)
  const latitudeOrigin = degreesToRadians(53.5)
  const longitudeOrigin = degreesToRadians(-8)
  const scale = 0.99982
  const falseEasting = 600_000
  const falseNorthing = 750_000
  const e2 = (a * a - b * b) / (a * a)
  const n = (a - b) / (a + b)
  const sinLatitude = Math.sin(latitude)
  const cosLatitude = Math.cos(latitude)
  const tanLatitude = Math.tan(latitude)
  const nu = (a * scale) / Math.sqrt(1 - e2 * sinLatitude ** 2)
  const rho =
    (a * scale * (1 - e2)) / Math.pow(1 - e2 * sinLatitude ** 2, 1.5)
  const eta2 = nu / rho - 1
  const latitudeDelta = latitude - latitudeOrigin
  const latitudeSum = latitude + latitudeOrigin
  const meridionalArc =
    b *
    scale *
    ((1 + n + (5 / 4) * n ** 2 + (5 / 4) * n ** 3) * latitudeDelta -
      (3 * n + 3 * n ** 2 + (21 / 8) * n ** 3) *
        Math.sin(latitudeDelta) *
        Math.cos(latitudeSum) +
      ((15 / 8) * n ** 2 + (15 / 8) * n ** 3) *
        Math.sin(2 * latitudeDelta) *
        Math.cos(2 * latitudeSum) -
      (35 / 24) * n ** 3 *
        Math.sin(3 * latitudeDelta) *
        Math.cos(3 * latitudeSum))
  const longitudeDelta = longitude - longitudeOrigin
  const ii = (nu / 2) * sinLatitude * cosLatitude
  const iii =
    (nu / 24) *
    sinLatitude *
    cosLatitude ** 3 *
    (5 - tanLatitude ** 2 + 9 * eta2)
  const iiia =
    (nu / 720) *
    sinLatitude *
    cosLatitude ** 5 *
    (61 - 58 * tanLatitude ** 2 + tanLatitude ** 4)
  const iv = nu * cosLatitude
  const v =
    (nu / 6) * cosLatitude ** 3 * (nu / rho - tanLatitude ** 2)
  const vi =
    (nu / 120) *
    cosLatitude ** 5 *
    (5 - 18 * tanLatitude ** 2 + tanLatitude ** 4 + 14 * eta2 - 58 * tanLatitude ** 2 * eta2)

  return {
    easting:
      falseEasting +
      iv * longitudeDelta +
      v * longitudeDelta ** 3 +
      vi * longitudeDelta ** 5,
    northing:
      falseNorthing +
      meridionalArc +
      ii * longitudeDelta ** 2 +
      iii * longitudeDelta ** 4 +
      iiia * longitudeDelta ** 6,
  }
}

function degreesToRadians(value: number) {
  return (value * Math.PI) / 180
}
