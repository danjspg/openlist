/**
 * Eircode syntax follows the published seven-character design:
 * - a Routing Key formed from an allowed letter plus two digits, or Dublin 6W (D6W)
 * - a four-character Unique Identifier using digits and the non-ambiguous letter set
 *
 * This validates format only. Confirming that an individual Eircode is assigned requires
 * licensed ECAF/ECAD data, which OpenList does not use.
 */
const EIRCODE_LETTERS = "AC-FHKNPRTV-Y"
const ROUTING_KEY_SOURCE = `(?:[${EIRCODE_LETTERS}][0-9]{2}|D6W)`
const UNIQUE_IDENTIFIER_SOURCE = `[0-9${EIRCODE_LETTERS}]{4}`

export const EIRCODE_COMPACT_PATTERN = new RegExp(
  `^${ROUTING_KEY_SOURCE}${UNIQUE_IDENTIFIER_SOURCE}$`
)

const EIRCODE_INPUT_PATTERN = new RegExp(
  `^(${ROUTING_KEY_SOURCE})\\s*(${UNIQUE_IDENTIFIER_SOURCE})$`
)

const EIRCODE_EXTRACT_PATTERN = new RegExp(
  `(?:^|[^0-9A-Z])(${ROUTING_KEY_SOURCE})\\s*(${UNIQUE_IDENTIFIER_SOURCE})(?=$|[^0-9A-Z])`,
  "i"
)

/** @param {unknown} value */
export function compactEircode(value) {
  const match = String(value ?? "").trim().toUpperCase().match(EIRCODE_INPUT_PATTERN)
  return match ? `${match[1]}${match[2]}` : null
}

/** @param {unknown} value */
export function normaliseEircode(value) {
  const compact = compactEircode(value)
  return compact ? `${compact.slice(0, 3)} ${compact.slice(3)}` : null
}

/** @param {unknown} value */
export function isValidEircode(value) {
  return compactEircode(value) !== null
}

/** @param {unknown} value */
export function extractEircode(value) {
  const match = String(value ?? "").match(EIRCODE_EXTRACT_PATTERN)
  return match ? normaliseEircode(`${match[1]}${match[2]}`) : null
}

/**
 * Identifies short code-shaped input so the UI can distinguish an invalid Eircode
 * attempt from an ordinary address or place query.
 * @param {unknown} value
 */
export function looksLikeEircode(value) {
  const input = String(value ?? "").trim().toUpperCase()
  if (!input || /[^A-Z0-9\s]/.test(input)) return false
  if (!/[0-9]/.test(input)) return false
  return /^[A-Z0-9]{3}\s*[A-Z0-9]{3,5}$/.test(input)
}
