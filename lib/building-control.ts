import { validPlanningEventDate } from "@/lib/planning-events"

export function validBuildingControlDate(value: unknown): value is string {
  return validPlanningEventDate(value) && value >= "2014-01-01" && value <= "2100-01-01"
}

export function completionCertificateLabel(units: number | null) {
  if (units === null || units === undefined) return "Completion certificate validated"
  return `Completion certificate validated (${units} ${units === 1 ? "unit" : "units"})`
}
