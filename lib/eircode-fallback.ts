import type { EircodeLocationContext } from "@/lib/eircode-location"

export type EircodeFallbackPlan = {
  routingKey: string
  label: string
  salesScope:
    | { kind: "routing-key"; routingKey: string }
    | { kind: "area"; county: string; areaSlug: string }
  statsScope: { county: string; areaSlug: string } | null
  planningLocalityFallback: string | null
}

export function getEircodeFallbackPlan(
  location: EircodeLocationContext
): EircodeFallbackPlan | null {
  if (location.source === "none" || !location.county) return null
  if (location.source === "routing-key" && location.routingMarkets.length > 1) {
    return null
  }

  const routingKey = location.eircode.slice(0, 3).toUpperCase()
  const routingMarket =
    location.source === "routing-key" ? location.routingMarkets[0] ?? null : null
  const broadArea = Boolean(
    location.areaSlug && normaliseSlug(location.county) === normaliseSlug(location.areaSlug)
  )
  const salesScope =
    !location.areaSlug || broadArea
      ? ({ kind: "routing-key", routingKey } as const)
      : ({
          kind: "area",
          county: location.county,
          areaSlug: location.areaSlug,
        } as const)

  return {
    routingKey,
    label:
      routingMarket?.label ??
      location.locality ??
      (location.areaSlug ? titleFromSlug(location.areaSlug) : `${routingKey} routing area`),
    salesScope,
    statsScope:
      location.areaSlug && !broadArea
        ? { county: location.county, areaSlug: location.areaSlug }
        : null,
    planningLocalityFallback: isSpecificPlanningLocality(
      location.county,
      location.locality
    )
      ? location.locality
      : null,
  }
}

export function isSpecificPlanningLocality(
  county: string,
  locality: string | null | undefined
) {
  const localitySlug = normaliseSlug(String(locality ?? ""))
  if (localitySlug.length < 3) return false
  return localitySlug !== normaliseSlug(county)
}

export function planningLocationContainsLocality(
  location: string | null | undefined,
  locality: string
) {
  const haystack = normaliseLocation(location)
  const needle = normaliseLocation(locality)
  if (!haystack || !needle) return false

  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  return new RegExp(`(^|[^a-z0-9])${escaped}(?=$|[^a-z0-9])`, "i").test(
    haystack
  )
}

export function planningLocationMatchesRoutingMarket(
  location: string | null | undefined,
  targetLocality: string,
  targetAreaSlug: string,
  routingAreas: Array<{
    locality?: string | null
    area_slug?: string | null
  }>
) {
  if (!planningLocationContainsLocality(location, targetLocality)) return false

  return !routingAreas.some((candidate) => {
    const candidateLocality = String(candidate.locality ?? "").trim()
    const candidateSlug = String(candidate.area_slug ?? "").trim()
    if (!candidateLocality || !candidateSlug) return false
    if (normaliseSlug(candidateSlug) === normaliseSlug(targetAreaSlug)) return false
    return planningLocationContainsLocality(location, candidateLocality)
  })
}

function normaliseLocation(value: string | null | undefined) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()
}

function titleFromSlug(value: string) {
  return value
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ")
}

function normaliseSlug(value: string) {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/['']/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
}
