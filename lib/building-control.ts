import { validPlanningEventDate } from "@/lib/planning-events"

export function validBuildingControlDate(value: unknown): value is string {
  return validPlanningEventDate(value) && value >= "2014-01-01" && value <= "2100-01-01"
}

export function completionCertificateLabel(units: number | null) {
  if (units === null || units === undefined) return "Completion certificate validated"
  return `Completion certificate validated (${units} ${units === 1 ? "unit" : "units"})`
}

export function constructionStatusLabel(status: string | null | undefined) {
  if (status === "commenced") return "Construction commenced"
  if (status === "completed") return "Completed"
  return null
}

export function resolveExactBcmsMatch(candidateIds: string[], compound = false) {
  const candidates = [...new Set(candidateIds.filter(Boolean))]
  if (compound || candidates.length > 1) return { outcome: "ambiguous" as const, applicationId: null }
  if (candidates.length === 0) return { outcome: "unmatched" as const, applicationId: null }
  return { outcome: "linked" as const, applicationId: candidates[0] }
}

export function deriveConstructionStatus(
  notices: Array<{ commencementDate?: string | null; completionCertificateCount?: number; completionUnits?: number | null; totalPhases?: number | null; projectStatus?: string | null }>,
  residentialUnits: number | null = null
) {
  if (!notices.some((notice) => notice.commencementDate)) return null
  const phased = notices.length > 1 || notices.some((notice) => Number(notice.totalPhases || 1) > 1)
  const completionUnits = notices.reduce((sum, notice) => sum + (Number(notice.completionUnits) || 0), 0)
  const hasValidatedCompletion = notices.every((notice) => Number(notice.completionCertificateCount || 0) > 0)
  const explicitCompleted = notices.every((notice) => /\bcomplete(?:d)?\b/i.test(notice.projectStatus || ""))
  const scaleSatisfied = residentialUnits
    ? completionUnits >= residentialUnits
    : explicitCompleted
  return !phased && hasValidatedCompletion && scaleSatisfied ? "completed" : "commenced"
}
