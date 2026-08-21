import { isLikelyTruncatedCorkSearchProposal } from "@/lib/cork-planning-source.mjs"
import {
  isTerminalPlanningStatus,
  normalisePlanningStatus,
  type PlanningStatus,
} from "@/lib/planning-status"

export type PlanningProposalPresentation = {
  display: string
  original: string | null
  isLikelyTruncated: boolean
}

const DEFAULT_PROPOSAL_TITLE_MAX_LENGTH = 120

type DecisionDueApplication = {
  normalized_status: PlanningStatus
  decision_due_date: string | null
  decision_date?: string | null
  final_grant_date?: string | null
  appeal_decision_date?: string | null
  withdrawal_date?: string | null
}

export type DecisionDuePresentation = {
  date: string
  formattedDate: string
}

export function decisionDuePresentation(
  application: DecisionDueApplication
): DecisionDuePresentation | null {
  const value = application.decision_due_date
  if (
    !value ||
    isTerminalPlanningStatus(application.normalized_status) ||
    application.normalized_status === "decision_made" ||
    application.decision_date ||
    application.final_grant_date ||
    application.appeal_decision_date ||
    application.withdrawal_date
  ) {
    return null
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  const due = new Date(`${value}T00:00:00Z`)
  if (Number.isNaN(due.getTime()) || due.toISOString().slice(0, 10) !== value) return null
  return {
    date: value,
    formattedDate: new Intl.DateTimeFormat("en-IE", {
      day: "numeric",
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    }).format(due),
  }
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
  return capitaliseFirstPlanningTextLetter(cleaned)
}

export function capitaliseFirstPlanningTextLetter(text: string) {
  const firstLetterIndex = text.search(/[A-Za-z]/)
  if (firstLetterIndex < 0) return text

  return `${text.slice(0, firstLetterIndex)}${text.charAt(firstLetterIndex).toLocaleUpperCase("en-IE")}${text.slice(firstLetterIndex + 1)}`
}

export function planningDisplayValue(value: string | null | undefined) {
  return meaningfulPlanningValue(value)
}

export function councilStatusPresentation(
  rawStatus: string | null | undefined,
  normalizedStatus: PlanningStatus
) {
  const value = meaningfulPlanningValue(rawStatus)
  if (!value) return null
  if (normalizedStatus !== "unknown" && normalisePlanningStatus(value) === normalizedStatus) {
    return null
  }
  return value
}

export function planningProposalTitle(
  proposal: string | null | undefined,
  fallback = "Planning application",
  maxLength = DEFAULT_PROPOSAL_TITLE_MAX_LENGTH
) {
  const text = meaningfulPlanningValue(proposal)
  if (!text) return capitaliseFirstPlanningTextLetter(fallback)
  const safeText = presentPlanningProposal(text, fallback).display
  return capitaliseFirstPlanningTextLetter(
    cappedPlanningProposalText(titlePresentationText(safeText), maxLength)
  )
}

export function planningProposalSummary(
  proposal: string | null | undefined,
  fallback = "Planning application details",
  maxLength = 155
) {
  const text = meaningfulPlanningValue(proposal)
  if (!text) return capitaliseFirstPlanningTextLetter(fallback)
  const safeText = presentPlanningProposal(text, fallback).display
  return capitaliseFirstPlanningTextLetter(cappedPlanningProposalText(safeText, maxLength))
}

function cappedPlanningProposalText(text: string, requestedMaxLength: number) {
  const maxLength = Math.max(40, requestedMaxLength)
  const firstSentence = firstCompletePlanningSentence(text)
  if (firstSentence && firstSentence.length <= maxLength) return firstSentence
  if (text.length <= maxLength) return text

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

const RETENTION_FRAMING = /^the\s+development\s+to\s+be\s+retained\s+consists\s+of\s*(?:(?:\(\s*1\s*\)|1\s*[).:-])\s*)?(?:the\s+)?/i
const PLANNING_ABBREVIATION = /^(?:\d+\s*)?(?:no|nos|ref)\.$/i

function titlePresentationText(text: string) {
  const retentionMatch = text.match(RETENTION_FRAMING)
  if (!retentionMatch) return text

  const firstItem = text.slice(retentionMatch[0].length).trim()
  if (!firstItem) return text
  return `Retention: ${firstItem.charAt(0).toLocaleLowerCase("en-IE")}${firstItem.slice(1)}`
}

function firstCompletePlanningSentence(text: string) {
  for (const match of text.matchAll(/[.!?](?=\s|$)/g)) {
    const end = (match.index ?? -1) + 1
    const sentence = text.slice(0, end).trim()
    const finalToken = sentence.split(/\s+/).at(-1) ?? ""
    if (!PLANNING_ABBREVIATION.test(finalToken)) return sentence
  }
  return null
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
    return {
      display: capitaliseFirstPlanningTextLetter(fallback),
      original: null,
      isLikelyTruncated: false,
    }
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
    return {
      display: capitaliseFirstPlanningTextLetter(original),
      original: null,
      isLikelyTruncated: false,
    }
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
  const display = safeText ? `${safeText}…` : fallback

  return {
    display: capitaliseFirstPlanningTextLetter(display),
    original,
    isLikelyTruncated: true,
  }
}
