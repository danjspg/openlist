import type { PprSearchAreaOption } from "@/lib/ppr"
import type { PlanningAuthority } from "@/lib/planning-authorities"
import { extractEircode } from "@/lib/eircode.mjs"

export { extractEircode } from "@/lib/eircode.mjs"

export type LocationMatchKind = "eircode" | "locality" | "county" | "none"

export type LocationIntelligenceContext = {
  county: string | null
  locality: string | null
  areaSlug: string | null
  eircode: string | null
  matchKind: LocationMatchKind
}

const AUTHORITY_COUNTIES: Record<string, string> = {
  CORKCOCO: "Cork",
  CORKCITY: "Cork",
  DUBLINCITY: "Dublin",
  FINGAL: "Dublin",
  SOUTHDUBLIN: "Dublin",
  DLR: "Dublin",
  KILDARE: "Kildare",
  GALWAYCOCO: "Galway",
  GALWAYCITY: "Galway",
  MEATH: "Meath",
  WICKLOW: "Wicklow",
  LIMERICK: "Limerick",
  WATERFORD: "Waterford",
  DONEGAL: "Donegal",
  WEXFORD: "Wexford",
  TIPPERARY: "Tipperary",
  KERRY: "Kerry",
  MAYO: "Mayo",
  CLARE: "Clare",
  LOUTH: "Louth",
  LAOIS: "Laois",
  KILKENNY: "Kilkenny",
  OFFALY: "Offaly",
  CAVAN: "Cavan",
  ROSCOMMON: "Roscommon",
  WESTMEATH: "Westmeath",
  MONAGHAN: "Monaghan",
  SLIGO: "Sligo",
  CARLOW: "Carlow",
  LONGFORD: "Longford",
  LEITRIM: "Leitrim",
}

const COUNTY_AUTHORITY_CODES = Object.entries(AUTHORITY_COUNTIES).reduce(
  (index, [code, county]) => {
    const codes = index.get(county) ?? []
    codes.push(code)
    index.set(county, codes)
    return index
  },
  new Map<string, string[]>()
)

export function planningReferenceSlug(reference: string) {
  return `ref-${Buffer.from(reference.trim(), "utf8").toString("base64url")}`
}

export function planningReferenceFromSlug(slug: string) {
  if (!slug.startsWith("ref-") || slug.length > 240) return null

  try {
    const reference = Buffer.from(slug.slice(4), "base64url").toString("utf8").trim()
    if (!reference || planningReferenceSlug(reference) !== slug) return null
    return reference
  } catch {
    return null
  }
}

export function planningApplicationPath(
  authority: Pick<PlanningAuthority, "slug">,
  reference: string
) {
  return `/planning/${authority.slug}/${planningReferenceSlug(reference)}`
}

export function countyForPlanningAuthority(code: string | null | undefined) {
  return code ? AUTHORITY_COUNTIES[code] ?? null : null
}

export function authorityCodesForCounty(county: string) {
  const entry = [...COUNTY_AUTHORITY_CODES.entries()].find(
    ([candidate]) => normaliseSlug(candidate) === normaliseSlug(county)
  )
  return entry?.[1] ?? []
}

function normalisedSearchText(value: string) {
  return normaliseSlug(value).replace(/-/g, " ")
}

export function matchPlanningLocation(
  input: {
    local_authority_code?: string | null
    location?: string | null
  },
  knownAreas: PprSearchAreaOption[]
): LocationIntelligenceContext {
  const county = countyForPlanningAuthority(input.local_authority_code)
  const eircode = extractEircode(input.location)
  const locationText = normalisedSearchText(String(input.location ?? ""))
  const candidates = knownAreas
    .filter(
      (area) =>
        county &&
        normaliseSlug(area.county) === normaliseSlug(county) &&
        normaliseSlug(area.areaLabel) !== normaliseSlug(county) &&
        locationText.includes(normalisedSearchText(area.areaLabel))
    )
    .sort((a, b) => b.areaLabel.length - a.areaLabel.length)
  const locality = candidates[0] ?? null

  if (eircode) {
    return {
      county,
      locality: locality?.areaLabel ?? null,
      areaSlug: locality?.areaSlug ?? null,
      eircode,
      matchKind: "eircode",
    }
  }

  if (locality) {
    return {
      county,
      locality: locality.areaLabel,
      areaSlug: locality.areaSlug,
      eircode: null,
      matchKind: "locality",
    }
  }

  return {
    county,
    locality: null,
    areaSlug: null,
    eircode: null,
    matchKind: county ? "county" : "none",
  }
}

function normaliseSlug(value: string) {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
}

type GridCoordinate = {
  grid_easting?: number | string | null
  grid_northing?: number | string | null
}

export function planningGridToWgs84(input: GridCoordinate) {
  const easting = Number(input.grid_easting)
  const northing = Number(input.grid_northing)

  // Irish planning feeds currently mix Irish Transverse Mercator and legacy
  // Irish Grid values. Only ITM values are plotted until a datum-correct legacy
  // conversion is introduced; this avoids showing a confidently wrong marker.
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

  return inverseTransverseMercator(easting, northing)
}

function inverseTransverseMercator(easting: number, northing: number) {
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
  const rho =
    (a * scale * (1 - e2)) / Math.pow(1 - e2 * sinLatitude ** 2, 1.5)
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
    (1 / (6 * cosLatitude * nu ** 3)) * (nu / rho + 2 * tanLatitude ** 2)
  const xii =
    (1 / (120 * cosLatitude * nu ** 5)) *
    (5 + 28 * tanLatitude ** 2 + 24 * tanLatitude ** 4)
  const xiia =
    (1 / (5040 * cosLatitude * nu ** 7)) *
    (61 + 662 * tanLatitude ** 2 + 1320 * tanLatitude ** 4 + 720 * tanLatitude ** 6)

  return {
    lat: radiansToDegrees(
      latitude - vii * deltaEasting ** 2 + viii * deltaEasting ** 4 - ix * deltaEasting ** 6
    ),
    lng: radiansToDegrees(
      longitudeOrigin +
        x * deltaEasting -
        xi * deltaEasting ** 3 +
        xii * deltaEasting ** 5 -
        xiia * deltaEasting ** 7
    ),
  }
}

function degreesToRadians(value: number) {
  return (value * Math.PI) / 180
}

function radiansToDegrees(value: number) {
  return (value * 180) / Math.PI
}

export function distanceInKilometres(
  first: { lat: number; lng: number },
  second: { lat: number; lng: number }
) {
  const earthRadiusKm = 6371.0088
  const latitudeDelta = degreesToRadians(second.lat - first.lat)
  const longitudeDelta = degreesToRadians(second.lng - first.lng)
  const firstLatitude = degreesToRadians(first.lat)
  const secondLatitude = degreesToRadians(second.lat)
  const haversine =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(firstLatitude) *
      Math.cos(secondLatitude) *
      Math.sin(longitudeDelta / 2) ** 2

  return earthRadiusKm * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine))
}
