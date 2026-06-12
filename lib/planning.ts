import { getServerSupabase } from "@/lib/supabase"

export type PlanningApplication = {
  id: string
  reference: string
  application_type: string | null
  proposal: string | null
  location: string | null
  applicant_name: string | null
  agent_name: string | null
  status: string | null
  decision_text: string | null
  registration_date: string | null
  decision_date: string | null
  final_grant_date: string | null
  ward: string | null
  source_url: string | null
}

export type PlanningCountStat = {
  label: string
  count: number
}

export type PlanningDashboard = {
  totalCount: number
  latestRegistrationDate: string | null
  recentApplications: PlanningApplication[]
  searchResults: PlanningApplication[]
  searchCount: number
  areaStats: PlanningCountStat[]
  statusStats: PlanningCountStat[]
  typeStats: PlanningCountStat[]
  monthStats: PlanningCountStat[]
  areaOptions: string[]
  statusOptions: string[]
  typeOptions: string[]
  activeArea: PlanningCountStat | null
}

export type PlanningSearchParams = {
  q?: string
  area?: string
  status?: string
  type?: string
}

const CORK_AUTHORITY_CODE = "CORKCOCO"
const APPLICATION_SELECT =
  "id,reference,application_type,proposal,location,applicant_name,agent_name,status,decision_text,registration_date,decision_date,final_grant_date,ward,source_url"

type PlanningAggregateRow = {
  ward: string | null
  location: string | null
  status: string | null
  application_type: string | null
  registration_date: string | null
}

export function formatPlanningDate(value: string | null | undefined) {
  if (!value) return "Not recorded"

  const date = new Date(`${value}T00:00:00`)
  if (Number.isNaN(date.getTime())) return "Not recorded"

  return new Intl.DateTimeFormat("en-IE", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date)
}

export function formatPlanningMonth(value: string) {
  const date = new Date(`${value}-01T00:00:00`)

  return new Intl.DateTimeFormat("en-IE", {
    month: "short",
    year: "numeric",
  }).format(date)
}

export function normalisePlanningSearchParams(
  params: PlanningSearchParams
): Required<PlanningSearchParams> {
  return {
    q: cleanParam(params.q),
    area: cleanParam(params.area),
    status: cleanParam(params.status),
    type: cleanParam(params.type),
  }
}

export async function getPlanningDashboard(
  params: PlanningSearchParams = {}
): Promise<PlanningDashboard> {
  const filters = normalisePlanningSearchParams(params)
  const supabase = getServerSupabase()

  const [countResult, latestResult, recentResult, aggregateResult] =
    await Promise.all([
      supabase
        .from("planning_applications")
        .select("id", { count: "exact", head: true })
        .eq("local_authority_code", CORK_AUTHORITY_CODE),
      supabase
        .from("planning_applications")
        .select("registration_date")
        .eq("local_authority_code", CORK_AUTHORITY_CODE)
        .not("registration_date", "is", null)
        .order("registration_date", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("planning_applications")
        .select(APPLICATION_SELECT)
        .eq("local_authority_code", CORK_AUTHORITY_CODE)
        .order("registration_date", { ascending: false })
        .order("reference", { ascending: false })
        .limit(8),
      supabase
        .from("planning_applications")
        .select("ward,location,status,application_type,registration_date")
        .eq("local_authority_code", CORK_AUTHORITY_CODE)
        .limit(5000),
    ])

  const aggregateRows = (aggregateResult.data ?? []) as PlanningAggregateRow[]
  const searchResult = await getPlanningSearchResults(filters)

  const areaStats = countBy(aggregateRows, normaliseAreaName).slice(0, 12)
  const statusStats = countBy(aggregateRows, (row) => row.status).slice(0, 8)
  const typeStats = countBy(aggregateRows, (row) => row.application_type).slice(
    0,
    8
  )
  const monthStats = countByMonth(aggregateRows).slice(0, 12).reverse()

  return {
    totalCount: countResult.count ?? aggregateRows.length,
    latestRegistrationDate:
      latestResult.data?.registration_date ??
      firstKnownValue(aggregateRows, (row) => row.registration_date),
    recentApplications: (recentResult.data ?? []) as PlanningApplication[],
    searchResults: searchResult.results,
    searchCount: searchResult.count,
    areaStats,
    statusStats,
    typeStats,
    monthStats,
    areaOptions: areaStats.map((stat) => stat.label),
    statusOptions: countBy(aggregateRows, (row) => row.status).map(
      (stat) => stat.label
    ),
    typeOptions: countBy(aggregateRows, (row) => row.application_type).map(
      (stat) => stat.label
    ),
    activeArea: areaStats[0] ?? null,
  }
}

async function getPlanningSearchResults(
  filters: Required<PlanningSearchParams>
) {
  const supabase = getServerSupabase()
  let query = supabase
    .from("planning_applications")
    .select(APPLICATION_SELECT, { count: "exact" })
    .eq("local_authority_code", CORK_AUTHORITY_CODE)

  if (filters.q) {
    const term = escapePostgrestLike(filters.q)
    query = query.or(
      [
        `reference.ilike.%${term}%`,
        `proposal.ilike.%${term}%`,
        `location.ilike.%${term}%`,
        `applicant_name.ilike.%${term}%`,
      ].join(",")
    )
  }

  if (filters.area) {
    query = query.ilike("ward", `%${escapePostgrestLike(filters.area)}%`)
  }

  if (filters.status) {
    query = query.eq("status", filters.status)
  }

  if (filters.type) {
    query = query.eq("application_type", filters.type)
  }

  const { data, count } = await query
    .order("registration_date", { ascending: false })
    .order("reference", { ascending: false })
    .limit(25)

  return {
    results: (data ?? []) as PlanningApplication[],
    count: count ?? data?.length ?? 0,
  }
}

function cleanParam(value: string | undefined) {
  return (value ?? "").trim().slice(0, 120)
}

function escapePostgrestLike(value: string) {
  return value.replace(/[,%]/g, " ").replace(/\s+/g, " ").trim()
}

function firstKnownValue<T>(
  rows: T[],
  getValue: (row: T) => string | null | undefined
) {
  return rows.map(getValue).find(Boolean) ?? null
}

function countBy<T>(
  rows: T[],
  getLabel: (row: T) => string | null | undefined
): PlanningCountStat[] {
  const counts = new Map<string, number>()

  for (const row of rows) {
    const label = cleanLabel(getLabel(row))
    if (!label) continue

    counts.set(label, (counts.get(label) ?? 0) + 1)
  }

  return [...counts.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
}

function countByMonth(rows: PlanningAggregateRow[]) {
  const counts = new Map<string, number>()

  for (const row of rows) {
    if (!row.registration_date) continue

    const label = row.registration_date.slice(0, 7)
    counts.set(label, (counts.get(label) ?? 0) + 1)
  }

  return [...counts.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.label.localeCompare(a.label))
}

function cleanLabel(value: string | null | undefined) {
  return value?.replace(/\s+/g, " ").trim() ?? ""
}

function normaliseAreaName(row: PlanningAggregateRow) {
  const ward = cleanLabel(row.ward)
  if (ward) {
    return ward
      .replace(/^Municipal Districts:\s*/i, "")
      .replace(/^Municipal District of\s*/i, "")
      .replace(/^The Municipal District of\s*/i, "")
  }

  const locationParts = cleanLabel(row.location)
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .filter((part) => !/^co\.?\s*cork$/i.test(part))

  return locationParts.at(-1) ?? ""
}
