export const DAILY_ACTIVE_PLANNING_STATUSES = [
  "pre_validation",
  "registered",
  "under_assessment",
  "further_information_requested",
  "further_information_received",
  "appealed",
] as const

export const DECISION_MADE_FOLLOW_UP_DAYS = 90
export const RECENT_UNKNOWN_FOLLOW_UP_DAYS = 365

export type ActivePlanningRefreshCandidate = {
  id: string
  local_authority_code: string
  registration_date: string | null
  normalized_status: string
}

export type ActivePlanningRefreshRange = {
  localAuthorityCode: string
  from: string
  to: string
  candidateCount: number
  monthCount: number
}

const DAY_MS = 24 * 60 * 60 * 1000

export function subtractUtcDays(value: string, days: number) {
  const date = new Date(`${value}T00:00:00Z`)
  if (Number.isNaN(date.getTime())) throw new Error(`Invalid date: ${value}`)
  return new Date(date.getTime() - days * DAY_MS).toISOString().slice(0, 10)
}

function monthStart(value: string) {
  const date = new Date(`${value}T00:00:00Z`)
  if (Number.isNaN(date.getTime())) throw new Error(`Invalid registration date: ${value}`)
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1))
}

function nextMonth(value: Date) {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth() + 1, 1))
}

function monthEnd(value: Date) {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth() + 1, 0))
}

function formatDate(value: Date) {
  return value.toISOString().slice(0, 10)
}

export function buildActivePlanningRefreshRanges(
  candidates: ActivePlanningRefreshCandidate[],
  today: string
): ActivePlanningRefreshRange[] {
  const todayDate = new Date(`${today}T00:00:00Z`)
  if (Number.isNaN(todayDate.getTime())) throw new Error(`Invalid date: ${today}`)

  const authorityMonths = new Map<string, Map<string, number>>()
  for (const candidate of candidates) {
    if (!candidate.local_authority_code || !candidate.registration_date) continue
    const start = monthStart(candidate.registration_date)
    if (start > todayDate) continue
    const key = formatDate(start)
    const months = authorityMonths.get(candidate.local_authority_code) ?? new Map<string, number>()
    months.set(key, (months.get(key) ?? 0) + 1)
    authorityMonths.set(candidate.local_authority_code, months)
  }

  const ranges: ActivePlanningRefreshRange[] = []
  for (const [localAuthorityCode, monthCounts] of authorityMonths) {
    const months = Array.from(monthCounts.keys())
      .map((value) => new Date(`${value}T00:00:00Z`))
      .sort((left, right) => left.getTime() - right.getTime())

    let rangeStart: Date | null = null
    let rangeEnd: Date | null = null
    let candidateCount = 0
    let monthCount = 0

    const flush = () => {
      if (!rangeStart || !rangeEnd) return
      const end = monthEnd(rangeEnd)
      if (end > todayDate) end.setTime(todayDate.getTime())
      ranges.push({
        localAuthorityCode,
        from: formatDate(rangeStart),
        to: formatDate(end),
        candidateCount,
        monthCount,
      })
    }

    for (const month of months) {
      const count = monthCounts.get(formatDate(month)) ?? 0
      if (!rangeStart || !rangeEnd) {
        rangeStart = month
        rangeEnd = month
        candidateCount = count
        monthCount = 1
        continue
      }

      if (month.getTime() === nextMonth(rangeEnd).getTime()) {
        rangeEnd = month
        candidateCount += count
        monthCount += 1
        continue
      }

      flush()
      rangeStart = month
      rangeEnd = month
      candidateCount = count
      monthCount = 1
    }
    flush()
  }

  return ranges.sort(
    (left, right) =>
      right.to.localeCompare(left.to) ||
      left.localAuthorityCode.localeCompare(right.localAuthorityCode) ||
      right.from.localeCompare(left.from)
  )
}
