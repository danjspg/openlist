import {
  isCanonicalPlanningStatus,
  isActivePlanningStatus,
  normalisePlanningStatus,
} from "./planning-status.mjs"

export const DEFAULT_PLANNING_NOTABLE_RETENTION_MONTHS = 12

const OUTCOME_DATE_FIELDS = Object.freeze([
  "decision_date",
  "final_grant_date",
  "withdrawal_date",
  "appeal_decision_date",
])

function dateOnly(value) {
  if (!value) return null
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.toISOString().slice(0, 10)
  }
  const match = String(value).match(/^(\d{4}-\d{2}-\d{2})/)
  if (!match) return null
  const parsed = new Date(`${match[1]}T00:00:00Z`)
  return Number.isNaN(parsed.getTime()) ? null : match[1]
}

function utcDateOnly(value) {
  const parsed = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(parsed.getTime())) throw new Error(`Invalid eligibility date: ${value}`)
  return parsed.toISOString().slice(0, 10)
}

export function planningNotableRetentionCutoff(
  asOf = new Date(),
  retentionMonths = DEFAULT_PLANNING_NOTABLE_RETENTION_MONTHS
) {
  const months = Math.max(1, Math.floor(Number(retentionMonths) || DEFAULT_PLANNING_NOTABLE_RETENTION_MONTHS))
  const source = new Date(`${utcDateOnly(asOf)}T00:00:00Z`)
  const targetMonth = new Date(Date.UTC(source.getUTCFullYear(), source.getUTCMonth() - months, 1))
  const targetMonthEnd = new Date(Date.UTC(
    targetMonth.getUTCFullYear(), targetMonth.getUTCMonth() + 1, 0
  )).getUTCDate()
  targetMonth.setUTCDate(Math.min(source.getUTCDate(), targetMonthEnd))
  return targetMonth.toISOString().slice(0, 10)
}

export function latestPlanningOutcomeDate(application) {
  return OUTCOME_DATE_FIELDS
    .map((field) => dateOnly(application?.[field]))
    .filter(Boolean)
    .sort()
    .at(-1) || null
}

export function planningNotableOverrideSources(existing) {
  const sources = Array.isArray(existing?.classification_sources)
    ? existing.classification_sources
    : existing?.source ? [existing.source] : []
  return [...new Set(sources.map(String).filter((source) => source && source !== "deterministic"))].sort()
}

export function evaluatePlanningNotableEligibility(
  application,
  existing,
  {
    structurallyNotable = false,
    asOf = new Date(),
    retentionMonths = DEFAULT_PLANNING_NOTABLE_RETENTION_MONTHS,
  } = {}
) {
  const rawStatus = application?.normalized_status || application?.status
  const status = isCanonicalPlanningStatus(rawStatus) ? rawStatus : normalisePlanningStatus(rawStatus)
  const active = isActivePlanningStatus(status)
  const latestOutcomeDate = latestPlanningOutcomeDate(application)
  const cutoffDate = planningNotableRetentionCutoff(asOf, retentionMonths)
  const recentOutcome = Boolean(latestOutcomeDate && latestOutcomeDate >= cutoffDate)
  const structuralEligible = Boolean(structurallyNotable && (active || recentOutcome))
  const overrideSources = planningNotableOverrideSources(existing)
  const overrideEligible = overrideSources.length > 0

  return {
    priorityEligible: structuralEligible || overrideEligible,
    structuralEligible,
    overrideEligible,
    reason: overrideEligible
      ? "explicit-override"
      : active && structurallyNotable
        ? "active-structural"
        : recentOutcome && structurallyNotable
          ? "recent-outcome-structural"
          : structurallyNotable
            ? "expired-structural"
            : "not-structurally-notable",
    status,
    active,
    latestOutcomeDate,
    cutoffDate,
    retentionMonths: Math.max(1, Math.floor(Number(retentionMonths) || DEFAULT_PLANNING_NOTABLE_RETENTION_MONTHS)),
    overrideSources,
  }
}
