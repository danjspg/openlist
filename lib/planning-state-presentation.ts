export type PlanningStateTone = "positive" | "negative" | "warning" | "neutral"

export type PlanningSemanticState = {
  heading: "Decision" | "Appeal decision" | "Current status"
  label: string
  tone: PlanningStateTone
  promotedDecision: boolean
}

const DECISION_STATUSES = new Set([
  "decision_made",
  "final_grant",
  "finalised",
  "appeal_decided",
])

function normaliseLabel(value: string | null | undefined) {
  return value?.trim().toLowerCase() ?? ""
}

export function planningDecisionTone(decision: string | null | undefined): PlanningStateTone {
  const normalised = normaliseLabel(decision)

  if (
    normalised.includes("split decision") ||
    (normalised.includes("grant") && normalised.includes("refus")) ||
    (normalised.includes("exempt") && normalised.includes("not exempt")) ||
    normalised.includes("request additional information") ||
    normalised.includes("request ai") ||
    normalised.includes("additional information") ||
    normalised.includes("declared not exempt") ||
    normalised.includes("not exempt") ||
    normalised.includes("other body")
  ) {
    return "warning"
  }

  if (
    normalised.includes("withdraw") ||
    normalised.includes("invalid") ||
    normalised.includes("incomplete") ||
    normalised.includes("refus")
  ) {
    return "negative"
  }

  if (
    normalised.includes("grant") ||
    normalised.includes("conditional") ||
    normalised.includes("unconditional") ||
    normalised.includes("condition") ||
    normalised.includes("approve") ||
    normalised.includes("declared exempt") ||
    normalised.includes("certificate of exemption")
  ) {
    return "positive"
  }

  return "neutral"
}

export function planningLifecycleTone(
  normalizedStatus: string | null | undefined,
  statusLabel?: string | null
): PlanningStateTone {
  const rawStatus = normaliseLabel(statusLabel)

  if (normalizedStatus === "invalid" || normalizedStatus === "withdrawn") {
    return "negative"
  }

  if (
    normalizedStatus === "further_information_requested" ||
    rawStatus.includes("further information requested") ||
    rawStatus.includes("additional information requested") ||
    rawStatus.includes("clarification")
  ) {
    return "warning"
  }

  if (normalizedStatus === "final_grant") {
    return "positive"
  }

  return "neutral"
}

export function planningSemanticState({
  normalizedStatus,
  statusLabel,
  decision,
}: {
  normalizedStatus: string | null | undefined
  statusLabel: string | null | undefined
  decision: string | null | undefined
}): PlanningSemanticState | null {
  const cleanDecision = decision?.trim() || null
  const cleanStatus = statusLabel?.trim() || null
  const promotedDecision = Boolean(
    cleanDecision && normalizedStatus && DECISION_STATUSES.has(normalizedStatus)
  )

  if (promotedDecision && cleanDecision) {
    return {
      heading: normalizedStatus === "appeal_decided" ? "Appeal decision" : "Decision",
      label: cleanDecision,
      tone: planningDecisionTone(cleanDecision),
      promotedDecision: true,
    }
  }

  if (!cleanStatus) return null

  return {
    heading: "Current status",
    label: cleanStatus,
    tone: planningLifecycleTone(normalizedStatus, cleanStatus),
    promotedDecision: false,
  }
}

export function planningStateBadgeClasses(tone: PlanningStateTone) {
  switch (tone) {
    case "positive":
      return "border-emerald-700 bg-emerald-700 text-white"
    case "negative":
      return "border-red-700 bg-red-700 text-white"
    case "warning":
      return "border-amber-300 bg-amber-50 text-amber-900"
    default:
      return "border-stone-300 bg-stone-100 text-stone-700"
  }
}

export function planningStatePanelClasses(tone: PlanningStateTone) {
  switch (tone) {
    case "positive":
      return "border-emerald-200 bg-emerald-50"
    case "negative":
      return "border-red-200 bg-red-50"
    case "warning":
      return "border-amber-200 bg-amber-50"
    default:
      return "border-stone-200 bg-stone-50"
  }
}

export function planningStateTextClasses(tone: PlanningStateTone) {
  switch (tone) {
    case "positive":
      return "text-emerald-900"
    case "negative":
      return "text-red-900"
    case "warning":
      return "text-amber-950"
    default:
      return "text-stone-950"
  }
}
