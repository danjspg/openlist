import type { PprSale, PprSearchAreaOption } from "@/lib/ppr"
import { isValidEircode, looksLikeEircode } from "@/lib/eircode.mjs"

export type UnifiedSearchIntent =
  | "planning-reference"
  | "eircode"
  | "invalid-eircode"
  | "address"
  | "area"

const STRONG_STREET_SUFFIXES = new Set([
  "avenue",
  "ave",
  "close",
  "court",
  "crescent",
  "drive",
  "gardens",
  "grove",
  "lane",
  "place",
  "quay",
  "road",
  "rd",
  "square",
  "street",
  "st",
  "terrace",
])

const WEAK_STREET_SUFFIXES = new Set(["hill", "park", "view"])

const CANONICAL_SUFFIXES: Record<string, string> = {
  ave: "avenue",
  rd: "road",
  st: "street",
}

function normalise(value: string) {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ")
}

function streetSuffix(value: string) {
  const tokens = normalise(value).split(" ").filter(Boolean)
  const strong = tokens.find((token) => STRONG_STREET_SUFFIXES.has(token))
  if (strong) return { suffix: strong, strength: "strong" as const }
  const weak = tokens.find((token) => WEAK_STREET_SUFFIXES.has(token))
  if (weak) return { suffix: weak, strength: "weak" as const }
  return null
}

function addressVariantKey(option: PprSearchAreaOption) {
  const tokens = normalise(option.areaLabel).split(" ").filter(Boolean)
  const last = tokens.at(-1)
  if (last && CANONICAL_SUFFIXES[last]) tokens[tokens.length - 1] = CANONICAL_SUFFIXES[last]
  return `${normalise(option.county)}::${tokens.join(" ")}`
}

export function classifyUnifiedSearchIntent(query: string): UnifiedSearchIntent {
  const cleaned = query.trim().replace(/\s+/g, " ")
  if (
    /^\d{1,4}\s*[\/-]\s*[A-Z0-9-]{1,12}$/i.test(cleaned) ||
    /^\d{5,10}$/.test(cleaned)
  ) {
    return "planning-reference"
  }

  if (isValidEircode(cleaned)) return "eircode"
  if (looksLikeEircode(cleaned)) return "invalid-eircode"

  if (/\d/.test(cleaned) && cleaned.length >= 5) return "address"
  return "area"
}

/**
 * Area statistics occasionally contain address fragments (for example,
 * "Carrigaline Rd") as tiny localities. Keep strong, exact localities while
 * demoting low-volume street-like variants when a clearer area match exists.
 */
export function rankPlaceSuggestions(
  query: string,
  suggestions: PprSearchAreaOption[],
  limit = 8
) {
  const normalisedQuery = normalise(query)
  const deduplicated = new Map<string, PprSearchAreaOption>()

  for (const suggestion of suggestions) {
    const key = addressVariantKey(suggestion)
    const current = deduplicated.get(key)
    if (!current || suggestion.salesCount > current.salesCount) {
      deduplicated.set(key, suggestion)
    }
  }

  const candidates = Array.from(deduplicated.values())
  const plainCandidates = candidates.filter((candidate) => !streetSuffix(candidate.areaLabel))
  const dominantPlainSales = Math.max(0, ...plainCandidates.map((candidate) => candidate.salesCount))

  const annotated = candidates.map((candidate) => {
    const label = normalise(candidate.areaLabel)
    const suffix = streetSuffix(candidate.areaLabel)
    const exact = label === normalisedQuery || normalise(candidate.areaSlug) === normalisedQuery
    const starts = label.startsWith(normalisedQuery) || normalisedQuery.startsWith(label)
    const relativeFloor = Math.max(8, Math.floor(dominantPlainSales * 0.1))
    const likelyAddressFragment = Boolean(
      suffix &&
        !exact &&
        ((suffix.strength === "strong" && candidate.salesCount < Math.max(15, relativeFloor)) ||
          (suffix.strength === "weak" && candidate.salesCount < relativeFloor))
    )
    const suffixPenalty = suffix?.strength === "strong" ? 220 : suffix ? 70 : 0
    const score =
      (exact ? 1_000 : 0) +
      (starts ? 300 : 0) +
      Math.log10(candidate.salesCount + 1) * 35 -
      suffixPenalty

    return { candidate, exact, likelyAddressFragment, score }
  })

  const hasClearArea = annotated.some((item) => !item.likelyAddressFragment)
  const filtered = hasClearArea
    ? annotated.filter((item) => !item.likelyAddressFragment)
    : annotated

  return filtered
    .sort((a, b) => {
      if (a.exact !== b.exact) return a.exact ? -1 : 1
      if (b.score !== a.score) return b.score - a.score
      if (b.candidate.salesCount !== a.candidate.salesCount) {
        return b.candidate.salesCount - a.candidate.salesCount
      }
      return a.candidate.areaLabel.localeCompare(b.candidate.areaLabel)
    })
    .slice(0, limit)
    .map((item) => item.candidate)
}

export function selectUniqueExactPlaceSuggestion(
  query: string,
  suggestions: PprSearchAreaOption[]
) {
  const normalisedQuery = normalise(query)
  const exact = suggestions.filter(
    (suggestion) =>
      normalise(suggestion.areaLabel) === normalisedQuery ||
      normalise(suggestion.areaSlug) === normalisedQuery
  )

  return exact.length === 1 ? exact[0] : null
}

export function rankAddressResults(query: string, sales: PprSale[], limit = 6) {
  const normalisedQuery = normalise(query)

  return sales
    .map((sale) => {
      const address = normalise(sale.address_normalised || sale.address_raw)
      return {
        sale,
        score:
          (address === normalisedQuery ? 1_000 : 0) +
          (address.startsWith(normalisedQuery) ? 500 : 0) +
          (address.includes(normalisedQuery) ? 300 : 0),
      }
    })
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score
      return b.sale.date_of_sale.localeCompare(a.sale.date_of_sale)
    })
    .slice(0, limit)
    .map((item) => item.sale)
}
