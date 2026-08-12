export type PlanningProposalPresentation = {
  display: string
  original: string | null
  isLikelyTruncated: boolean
}

const UNAVAILABLE_SOURCE_VALUES = new Set([
  "-",
  "n/a",
  "na",
  "none",
  "null",
  "not applicable",
  "not available",
  "not recorded",
  "not recorded in source",
  "not supplied",
  "undefined",
  "unknown",
])

export function meaningfulPlanningValue(
  value: string | null | undefined
) {
  const cleaned = String(value ?? "").replace(/\s+/g, " ").trim()
  if (!cleaned || UNAVAILABLE_SOURCE_VALUES.has(cleaned.toLowerCase())) {
    return null
  }
  return cleaned
}

const DANGLING_NUMBERED_ITEM = /[,;]\s*(?:and\s+)?\d+\s*[\).:-]\s*[A-Za-z]{1,3}\s*$/i
const DANGLING_SHORT_CLAUSE = /[,;:]\s+[A-Za-z]{1,2}\s*$/i
const DANGLING_CONNECTOR = /\b(?:and|or|with|to|for|of|the|including|comprising)\s*$/i
const OBSERVED_IMPORT_LIMIT_MIN = 79
const OBSERVED_IMPORT_LIMIT_MAX = 81

export function presentPlanningProposal(
  proposal: string | null | undefined,
  fallback = "Proposal description not recorded"
): PlanningProposalPresentation {
  const original = String(proposal || "").trim().replace(/\s+/g, " ")
  if (!original) {
    return { display: fallback, original: null, isLikelyTruncated: false }
  }

  const numberedMatch = original.match(DANGLING_NUMBERED_ITEM)
  const shortClauseMatch = original.length >= 75
    ? original.match(DANGLING_SHORT_CLAUSE)
    : null
  const connectorMatch = original.length >= 75
    ? original.match(DANGLING_CONNECTOR)
    : null
  const reachesObservedImportLimit =
    original.length >= OBSERVED_IMPORT_LIMIT_MIN &&
    original.length <= OBSERVED_IMPORT_LIMIT_MAX &&
    !/[.!?)]$/.test(original)
  const truncationMatch = numberedMatch || shortClauseMatch || connectorMatch

  if (
    !reachesObservedImportLimit &&
    (!truncationMatch || typeof truncationMatch.index !== "number")
  ) {
    return { display: original, original: null, isLikelyTruncated: false }
  }

  const cutIndex = truncationMatch && typeof truncationMatch.index === "number"
    ? truncationMatch.index
    : original.length
  let safeText = original
    .slice(0, cutIndex)
    .trim()
    .replace(/[,;:]\s*$/, "")

  if (reachesObservedImportLimit && cutIndex === original.length) {
    const lastClauseBoundary = Math.max(
      safeText.lastIndexOf(","),
      safeText.lastIndexOf(";")
    )
    if (lastClauseBoundary >= 35) {
      safeText = safeText.slice(0, lastClauseBoundary).trim()
    } else if (/\s+[A-Za-z]{1,6}$/.test(safeText)) {
      safeText = safeText.replace(/\s+[A-Za-z]{1,6}$/, "").trim()
    }
  }

  const permissionList = safeText.match(/^Permission for:\s*1\s*[\).:-]\s*(.+)$/i)
  if (permissionList?.[1]) {
    const body = permissionList[1]
    safeText = `Permission for ${body.charAt(0).toLocaleLowerCase("en-IE")}${body.slice(1)}`
  }

  safeText = safeText.replace(/[.!?…]+$/, "").trim()

  return {
    display: safeText ? `${safeText}…` : fallback,
    original,
    isLikelyTruncated: true,
  }
}
