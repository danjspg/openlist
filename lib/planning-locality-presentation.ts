import type { PlanningCountStat } from "@/lib/planning"
import {
  normalisePlanningStatus,
  planningStatusLabel,
  type PlanningStatus,
} from "@/lib/planning-status"

export function formatPlanningCount(value: number) {
  return value.toLocaleString("en-IE")
}

export function latestRegistrationMonthLabel(value: string | null) {
  if (!value) return "Latest registration month"

  const date = new Date(`${value}-01T00:00:00`)
  if (Number.isNaN(date.getTime())) return "Latest registration month"

  return `Registered in ${new Intl.DateTimeFormat("en-IE", {
    month: "long",
    year: "numeric",
  }).format(date)}`
}

export function localityStatusStats(stats: PlanningCountStat[]) {
  const grouped = new Map<PlanningStatus, number>()

  for (const stat of stats) {
    const status = normalisePlanningStatus(stat.label)
    grouped.set(status, (grouped.get(status) ?? 0) + stat.count)
  }

  return [...grouped.entries()]
    .map(([status, count]) => ({ label: planningStatusLabel(status), count }))
    .sort((left, right) => right.count - left.count || left.label.localeCompare(right.label, "en-IE"))
}
