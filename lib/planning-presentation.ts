import { isLikelyTruncatedCorkSearchProposal } from "@/lib/cork-planning-source.mjs"

export type PlanningProposalPresentation = {
  display: string
  original: string | null
  isLikelyTruncated: boolean
}

const DEFAULT_PROPOSAL_TITLE_MAX_LENGTH = 120

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

export function planningProposalTitle(
  proposal: string | null | undefined,
  fallback = "Planning application",
  maxLength = DEFAULT_PROPOSAL_TITLE_MAX_LENGTH
) {
  const text = meaningfulPlanningValue(proposal)
  if (!text) return fallback
  return cappedPlanningProposalText(text, maxLength)
}

export function planningProposalSummary(
  proposal: string | null | undefined,
  fallback = "Planning application details",
  maxLength = 155
) {
  const text = meaningfulPlanningValue(proposal)
  if (!text) return fallback
  return cappedPlanningProposalText(text, maxLength)
}

function cappedPlanningProposalText(text: string, requestedMaxLength: number) {
  const maxLength = Math.max(40, requestedMaxLength)
  if (text.length <= maxLength) return text

  const firstSentence = text.match(/^.*?[.!?](?=\s|$)/)?.[0]?.trim()
  if (firstSentence && firstSentence.length <= maxLength) return firstSentence

  const minimumBoundary = Math.min(70, Math.floor(maxLength * 0.55))
  const candidate = text.slice(0, maxLength + 1)
  let cutIndex = -1
  for (const match of candidate.matchAll(/[;:,](?=\s|$)/g)) {
    if ((match.index ?? -1) >= minimumBoundary) cutIndex = match.index ?? cutIndex
  }

  if (cutIndex < minimumBoundary) {
    const conjunctions = [...candidate.matchAll(/\s(?:and|with|including|comprising)\s/gi)]
    const boundary = conjunctions.findLast(
      (match) => (match.index ?? -1) >= minimumBoundary
    )
    if (boundary?.index !== undefined) cutIndex = boundary.index
  }

  if (cutIndex < minimumBoundary) {
    cutIndex = candidate.lastIndexOf(" ", maxLength)
  }

  const summary = text
    .slice(0, cutIndex > 0 ? cutIndex : maxLength)
    .trim()
    .replace(/[,;:]$/, "")
    .replace(/[.!?…]+$/, "")

  return summary ? `${summary}…` : text
}

const DANGLING_NUMBERED_ITEM = /[,;]\s*(?:and\s+)?\d+\s*[\).:-]\s*[A-Za-z]{1,3}\s*$/i
const DANGLING_SHORT_CLAUSE = /[,;:]\s+[A-Za-z]{1,2}\s*$/i
const DANGLING_CONNECTOR = /\b(?:and|or|with|to|for|of|the|including|comprising)\s*$/i
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
  const reachesObservedImportLimit = isLikelyTruncatedCorkSearchProposal(original)
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
