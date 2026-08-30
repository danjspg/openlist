import type { PlanningSearchParams } from "@/lib/planning"

export type PlanningFilterKey = "area" | "council" | "status" | "type" | "construction"

export function buildPlanningFilterFields(
  filters: Required<PlanningSearchParams>,
  key: PlanningFilterKey,
  value: string
) {
  const fields: Partial<Record<keyof PlanningSearchParams, string>> = {}

  for (const filterKey of ["q", "area", "council", "status", "type", "construction", "sort"] as const) {
    const nextValue = filterKey === key ? value : filters[filterKey]
    if (nextValue) fields[filterKey] = nextValue
  }

  return fields
}
