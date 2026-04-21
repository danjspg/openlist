export const IRISH_COUNTIES = [
  "Antrim",
  "Armagh",
  "Carlow",
  "Cavan",
  "Clare",
  "Cork",
  "Derry",
  "Donegal",
  "Down",
  "Dublin",
  "Fermanagh",
  "Galway",
  "Kerry",
  "Kildare",
  "Kilkenny",
  "Laois",
  "Leitrim",
  "Limerick",
  "Longford",
  "Louth",
  "Mayo",
  "Meath",
  "Monaghan",
  "Offaly",
  "Roscommon",
  "Sligo",
  "Tipperary",
  "Tyrone",
  "Waterford",
  "Westmeath",
  "Wexford",
  "Wicklow",
] as const

export const PROPERTY_TYPES = [
  "House",
  "Apartment",
  "Site",
  "Commercial",
] as const

export const STATUS_OPTIONS = [
  "Draft",
  "For Sale",
  "Sale Agreed",
  "Sold",
  "Paused",
  "Archived",
] as const

export function getSubtypeOptions(type: string): string[] {
  switch (type) {
    case "House":
      return [
        "Detached House",
        "Semi-detached House",
        "Terraced House",
        "Bungalow",
        "Cottage",
        "New Development",
      ]
    case "Apartment":
      return [
        "Apartment",
        "Penthouse",
        "Duplex",
        "Studio",
        "New Development",
      ]
    case "Site":
      return [
        "Residential Site",
        "Coastal Site",
        "Development Site",
      ]
    case "Commercial":
      return [
        "Office",
        "Retail Unit",
        "Industrial Unit",
        "Mixed Use",
      ]
    default:
      return []
  }
}

export function getAreaUnitOptions(type: string): string[] {
  if (type === "House" || type === "Apartment") {
    return ["sqft", "sqm"]
  }

  if (type === "Site") {
    return ["acres", "sqm"]
  }

  return ["sqm"]
}

export function generateListingTitle({
  type,
  subtype,
  addressLine2,
  county,
}: {
  type: string
  subtype?: string | null
  addressLine2?: string | null
  county?: string | null
}) {
  const lead = (subtype || type || "Property").trim()
  const parts = [lead, addressLine2?.trim(), county?.trim()].filter(Boolean)
  return parts.join(", ")
}

export function formatLocation(addressLine2?: string | null, county?: string | null) {
  return [addressLine2?.trim(), county?.trim()].filter(Boolean).join(", ")
}

function round(value: number) {
  return Math.round(value)
}

function formatWhole(value: number) {
  return new Intl.NumberFormat("en-IE", {
    maximumFractionDigits: 0,
  }).format(value)
}

function formatOneDecimal(value: number) {
  return new Intl.NumberFormat("en-IE", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(value)
}

export function convertSqftToSqm(value: number) {
  return value / 10.7639
}

export function convertSqmToSqft(value: number) {
  return value * 10.7639
}

export function convertAcresToSqm(value: number) {
  return value * 4046.8564224
}

export function convertSqmToAcres(value: number) {
  return value / 4046.8564224
}

export function getAreaDisplay({
  type,
  areaValue,
  areaUnit,
}: {
  type?: string | null
  areaValue?: number | null
  areaUnit?: string | null
}) {
  if (!areaValue || !areaUnit) {
    return "—"
  }

  if (type === "House" || type === "Apartment") {
    if (areaUnit === "sqft") {
      const sqm = round(convertSqftToSqm(areaValue))
      return `${formatWhole(areaValue)} sq ft / ${formatWhole(sqm)} sq m`
    }

    if (areaUnit === "sqm") {
      const sqft = round(convertSqmToSqft(areaValue))
      return `${formatWhole(sqft)} sq ft / ${formatWhole(areaValue)} sq m`
    }
  }

  if (type === "Site") {
    if (areaUnit === "acres") {
      const sqm = round(convertAcresToSqm(areaValue))
      return `${formatOneDecimal(areaValue)} acres / ${formatWhole(sqm)} sq m`
    }

    if (areaUnit === "sqm") {
      const acres = convertSqmToAcres(areaValue)
      return `${formatOneDecimal(acres)} acres / ${formatWhole(areaValue)} sq m`
    }
  }

  if (areaUnit === "sqm") {
    return `${formatWhole(areaValue)} sq m`
  }

  if (areaUnit === "sqft") {
    return `${formatWhole(areaValue)} sq ft`
  }

  if (areaUnit === "acres") {
    return `${formatOneDecimal(areaValue)} acres`
  }

  return "—"
}

export function getLegacySqftValue(type: string, areaValue: number, areaUnit: string) {
  if (!areaValue || !areaUnit) {
    return 0
  }

  if (type === "House" || type === "Apartment") {
    if (areaUnit === "sqft") return round(areaValue)
    if (areaUnit === "sqm") return round(convertSqmToSqft(areaValue))
  }

  if (type === "Site") {
    if (areaUnit === "sqm") return round(areaValue)
    if (areaUnit === "acres") return round(convertAcresToSqm(areaValue))
  }

  return round(areaValue)
}
