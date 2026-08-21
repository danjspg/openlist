export const LOCALITY_COHORT_SIZE = 100
export const LOCALITY_MIN_RESIDENCE_DAYS = 42
export const LOCALITY_MAX_ROTATION = 20

export function localityPath(surface: "sold_prices" | "planning", input: {
  county?: string | null; authority?: string | null; slug: string
}) {
  return surface === "sold_prices"
    ? `/sold-prices/${String(input.county || "").toLowerCase()}/${input.slug}`
    : `/planning/${input.authority}/areas/${input.slug}`
}

export function selectCohort<T extends { path: string; score: number }>(candidates: T[], size = LOCALITY_COHORT_SIZE) {
  const seen = new Set<string>()
  return [...candidates].sort((a, b) => b.score - a.score || a.path.localeCompare(b.path))
    .filter((candidate) => !seen.has(candidate.path) && Boolean(seen.add(candidate.path))).slice(0, size)
}
