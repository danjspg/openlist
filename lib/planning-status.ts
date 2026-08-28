import {
  ACTIVE_PLANNING_STATUSES,
  isActivePlanningStatus as isActivePlanningStatusRuntime,
  isTerminalPlanningStatus as isTerminalPlanningStatusRuntime,
  isCanonicalPlanningStatus as isCanonicalPlanningStatusRuntime,
  normalisePlanningStatus as normalisePlanningStatusRuntime,
  planningStatusKey as planningStatusKeyRuntime,
  planningStatusLabel as planningStatusLabelRuntime,
  STATUS_LABELS,
} from "./planning-status.mjs"

export type PlanningStatus = keyof typeof STATUS_LABELS

export const normalisePlanningStatus = normalisePlanningStatusRuntime as (
  value: unknown
) => PlanningStatus
export const planningStatusLabel = planningStatusLabelRuntime as (
  value: PlanningStatus
) => string
export const planningStatusKey = planningStatusKeyRuntime as (
  value: unknown
) => string
export const isTerminalPlanningStatus = isTerminalPlanningStatusRuntime as (
  value: PlanningStatus
) => boolean
export const isActivePlanningStatus = isActivePlanningStatusRuntime as (
  value: PlanningStatus
) => boolean
export { ACTIVE_PLANNING_STATUSES }
export const isCanonicalPlanningStatus = isCanonicalPlanningStatusRuntime as (
  value: unknown
) => value is PlanningStatus

export const PLANNING_STATUS_OPTIONS = Object.keys(STATUS_LABELS).map((value) => ({
  value: value as PlanningStatus,
  label: planningStatusLabel(value as PlanningStatus),
}))
