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

export type PlanningCommencement = {
  id: string
  metric: string
  period_month: string
  year: number
  month: number
  value: number
  source_url: string
  source_dataset: string
}

export type PlanningCommencementsDashboard = {
  totalRows: number
  latestMonth: string | null
  latestUnits: number
  latestNotices: number
  yearToDateUnits: number
  selectedMetric: string
  selectedMetricLabel: string
  recentCommencements: PlanningCommencementSummary[]
  recentUnits: PlanningCountStat[]
  typeBreakdown: PlanningCountStat[]
  sourceUrl: string | null
}

export type PlanningCommencementSummary = {
  periodMonth: string
  selectedValue: number
  units: number
  notices: number
  oneOffs: number
  scheme: number
  apartments: number
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
  commencements: PlanningCommencementsDashboard
}

export type PlanningSearchParams = {
  q?: string
  area?: string
  status?: string
  type?: string
  commencementMetric?: string
}

const CORK_AUTHORITY_CODE = "CORKCOCO"
const APPLICATION_SELECT =
  "id,reference,application_type,proposal,location,applicant_name,agent_name,status,decision_text,registration_date,decision_date,final_grant_date,ward,source_url"
const COMMENCEMENT_SELECT =
  "id,metric,period_month,year,month,value,source_url,source_dataset"

type PlanningAggregateRow = {
  ward: string | null
  location: string | null
  status: string | null
  application_type: string | null
  registration_date: string | null
}

type PlanningCommencementRow = PlanningCommencement

const COMMENCEMENT_METRICS = [
  { source: "All Units", label: "All units" },
  { source: "Notices", label: "Notices" },
  { source: "Oneoffs", label: "One-off homes" },
  { source: "Scheme", label: "Scheme units" },
  { source: "Apartments", label: "Apartments" },
]

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
  const date = value.length === 7 ? new Date(`${value}-01T00:00:00`) : new Date(value)

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
    commencementMetric: cleanParam(params.commencementMetric),
  }
}

export async function getPlanningDashboard(
  params: PlanningSearchParams = {}
): Promise<PlanningDashboard> {
  const filters = normalisePlanningSearchParams(params)
  const supabase = getServerSupabase()

  const [countResult, latestResult, recentResult, aggregateResult, commencements] =
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
      getPlanningCommencements(filters.commencementMetric),
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
    commencements,
  }
}

async function getPlanningCommencements(
  requestedMetric: string
): Promise<PlanningCommencementsDashboard> {
  const supabase = getServerSupabase()
  const { data, error } = await supabase
    .from("planning_commencements")
    .select(COMMENCEMENT_SELECT)
    .eq("local_authority_code", CORK_AUTHORITY_CODE)
    .order("period_month", { ascending: false })

  if (error) {
    return emptyCommencementsDashboard()
  }

  const rows = ((data ?? []) as PlanningCommencementRow[]).filter(
    (row) => row.value > 0
  )
  if (rows.length === 0) return emptyCommencementsDashboard()

  const allUnits = rows
    .filter((row) => row.metric === "All Units")
    .sort((a, b) => b.period_month.localeCompare(a.period_month))
  const selectedMetric = normaliseCommencementMetric(requestedMetric)
  const selectedMetricLabel = commencementMetricLabel(selectedMetric)
  const selectedRows = rows
    .filter((row) => row.metric === selectedMetric)
    .sort((a, b) => b.period_month.localeCompare(a.period_month))
  const latestUnitsRow = allUnits[0] ?? null
  const latestMonth = latestUnitsRow?.period_month ?? null
  const latestNotices =
    rows.find((row) => row.period_month === latestMonth && row.metric === "Notices")
      ?.value ?? 0
  const latestYear = latestUnitsRow?.year ?? null
  const yearToDateUnits = latestYear
    ? allUnits
        .filter((row) => row.year === latestYear && row.period_month <= latestMonth!)
        .reduce((sum, row) => sum + row.value, 0)
    : 0

  const typeMetrics = [
    { source: "Oneoffs", label: "One-off homes" },
    { source: "Scheme", label: "Scheme units" },
    { source: "Apartments", label: "Apartments" },
  ]
  const typeBreakdown = typeMetrics
    .map((metric) => ({
      label: metric.label,
      count:
        rows.find(
          (row) => row.period_month === latestMonth && row.metric === metric.source
        )?.value ?? 0,
    }))
    .filter((stat) => stat.count > 0)
    .sort((a, b) => b.count - a.count)

  return {
    totalRows: rows.length,
    latestMonth,
    latestUnits: latestUnitsRow?.value ?? 0,
    latestNotices,
    yearToDateUnits,
    selectedMetric,
    selectedMetricLabel,
    recentCommencements: selectedRows.slice(0, 8).map((row) =>
      commencementSummaryForMonth(rows, row.period_month, row.value)
    ),
    recentUnits: allUnits
      .slice(0, 12)
      .reverse()
      .map((row) => ({
        label: formatPlanningMonth(row.period_month),
        count: row.value,
      })),
    typeBreakdown,
    sourceUrl: rows[0]?.source_url ?? null,
  }
}

function emptyCommencementsDashboard(): PlanningCommencementsDashboard {
  return {
    totalRows: 0,
    latestMonth: null,
    latestUnits: 0,
    latestNotices: 0,
    yearToDateUnits: 0,
    selectedMetric: "All Units",
    selectedMetricLabel: "All units",
    recentCommencements: [],
    recentUnits: [],
    typeBreakdown: [],
    sourceUrl: null,
  }
}

function commencementSummaryForMonth(
  rows: PlanningCommencementRow[],
  periodMonth: string,
  selectedValue: number
): PlanningCommencementSummary {
  const valueForMetric = (metric: string) =>
    rows.find((row) => row.period_month === periodMonth && row.metric === metric)
      ?.value ?? 0

  return {
    periodMonth,
    selectedValue,
    units: valueForMetric("All Units"),
    notices: valueForMetric("Notices"),
    oneOffs: valueForMetric("Oneoffs"),
    scheme: valueForMetric("Scheme"),
    apartments: valueForMetric("Apartments"),
  }
}

function normaliseCommencementMetric(value: string) {
  return (
    COMMENCEMENT_METRICS.find(
      (metric) => metric.source.toLowerCase() === value.toLowerCase()
    )?.source ?? "All Units"
  )
}

function commencementMetricLabel(value: string) {
  return (
    COMMENCEMENT_METRICS.find((metric) => metric.source === value)?.label ??
    "All units"
  )
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
