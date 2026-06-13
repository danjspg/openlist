import { unstable_cache } from "next/cache"
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

export type PlanningCommencementsPage = PlanningCommencementsDashboard & {
  results: PlanningCommencementSummary[]
  searchCount: number
  metricOptions: { value: string; label: string }[]
  monthOptions: string[]
  selectedMonth: string
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
}

type PlanningAggregateSummary = Pick<
  PlanningDashboard,
  | "totalCount"
  | "latestRegistrationDate"
  | "areaStats"
  | "statusStats"
  | "typeStats"
  | "monthStats"
  | "areaOptions"
  | "statusOptions"
  | "typeOptions"
  | "activeArea"
>

export type PlanningSearchParams = {
  q?: string
  area?: string
  status?: string
  type?: string
  commencementMetric?: string
  month?: string
}

const CORK_AUTHORITY_CODE = "CORKCOCO"
const COMMENCEMENT_MONTHS_BACK = 36
const PLANNING_AGGREGATE_PAGE_SIZE = 1000
const PLANNING_CACHE_REVALIDATE_SECONDS = 60 * 60 * 6
const PLANNING_AGGREGATE_CACHE_VERSION = "v1"
const PLANNING_AREA_OPTION_LIMIT = 80
const APPLICATION_SELECT =
  "id,reference,application_type,proposal,location,applicant_name,agent_name,status,decision_text,registration_date,decision_date,final_grant_date,ward,source_url"
const COMMENCEMENT_SELECT =
  "id,metric,period_month,year,month,value,source_url,source_dataset"
const CORK_LOCALITY_NAMES = [
  "Carrigaline",
  "Myrtleville",
  "Crosshaven",
  "Fountainstown",
  "Monkstown",
  "Passage West",
  "Ringaskiddy",
  "Douglas",
  "Glanmire",
  "Ballincollig",
  "Blarney",
  "Tower",
  "Mallow",
  "Fermoy",
  "Midleton",
  "Cobh",
  "Youghal",
  "Kinsale",
  "Bandon",
  "Clonakilty",
  "Macroom",
  "Skibbereen",
  "Bantry",
  "Dunmanway",
  "Mitchelstown",
  "Charleville",
  "Kanturk",
  "Newmarket",
  "Millstreet",
  "Buttevant",
  "Doneraile",
  "Castletownbere",
  "Schull",
  "Baltimore",
  "Rosscarbery",
  "Leap",
  "Innishannon",
  "Belgooly",
  "Ballinspittle",
  "Riverstick",
  "Minane Bridge",
  "Watergrasshill",
  "Carrigtwohill",
  "Little Island",
  "Whitegate",
  "Aghada",
  "Cloyne",
  "Castlemartyr",
  "Killeagh",
  "Rathcormac",
  "Glanworth",
  "Kilworth",
  "Coachford",
  "Dripsey",
  "Ballyvourney",
  "Ballydehob",
  "Ballylickey",
  "Timoleague",
  "Courtmacsherry",
  "Enniskeane",
  "Ballineen",
  "Ballygarvan",
  "Ballinhassig",
  "Grenagh",
  "Rylane",
  "Banteer",
  "Boherbue",
  "Freemount",
  "Liscarroll",
  "Newtownshandrum",
  "Shanagarry",
  "Ballycotton",
  "Goleen",
  "Allihies",
].sort((a, b) => b.length - a.length)

type PlanningAggregateRow = {
  reference: string | null
  proposal: string | null
  ward: string | null
  location: string | null
  applicant_name: string | null
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
    month: cleanParam(params.month),
  }
}

export async function getPlanningDashboard(
  params: PlanningSearchParams = {}
): Promise<PlanningDashboard> {
  const filters = normalisePlanningSearchParams(params)
  const supabase = getServerSupabase()
  const hasApplicationFilters = Boolean(
    filters.q || filters.area || filters.status || filters.type
  )

  const [recentResult, overview, searchResult] =
    await Promise.all([
      supabase
        .from("planning_applications")
        .select(APPLICATION_SELECT)
        .eq("local_authority_code", CORK_AUTHORITY_CODE)
        .order("registration_date", { ascending: false })
        .order("reference", { ascending: false })
        .limit(8),
      getPlanningAggregateSummaryCached(),
      hasApplicationFilters
        ? getPlanningSearchResults(filters)
        : Promise.resolve({ results: [] as PlanningApplication[], count: 0 }),
    ])
  const filteredSummary = hasApplicationFilters
    ? buildPlanningAggregateSummary(
        searchResult.results.map(planningApplicationToAggregateRow),
        searchResult.count
      )
    : overview

  return {
    totalCount: overview.totalCount,
    latestRegistrationDate: overview.latestRegistrationDate,
    recentApplications: (recentResult.data ?? []) as PlanningApplication[],
    searchResults: searchResult.results,
    searchCount: searchResult.count,
    areaStats: filteredSummary.areaStats,
    statusStats: filteredSummary.statusStats,
    typeStats: filteredSummary.typeStats,
    monthStats: filteredSummary.monthStats,
    areaOptions: overview.areaOptions,
    statusOptions: overview.statusOptions,
    typeOptions: overview.typeOptions,
    activeArea: filteredSummary.activeArea,
  }
}

async function getPlanningAggregateRows() {
  const supabase = getServerSupabase()
  const rows: PlanningAggregateRow[] = []

  for (let from = 0; ; from += PLANNING_AGGREGATE_PAGE_SIZE) {
    const to = from + PLANNING_AGGREGATE_PAGE_SIZE - 1
    const { data, error } = await supabase
      .from("planning_applications")
      .select(
        "reference,proposal,ward,location,applicant_name,status,application_type,registration_date"
      )
      .eq("local_authority_code", CORK_AUTHORITY_CODE)
      .order("registration_date", { ascending: false })
      .range(from, to)

    if (error) break

    const page = (data ?? []) as PlanningAggregateRow[]
    rows.push(...page)
    if (page.length < PLANNING_AGGREGATE_PAGE_SIZE) break
  }

  return rows
}

async function getPlanningAggregateSummaryUncached() {
  const rows = await getPlanningAggregateRows()
  return buildPlanningAggregateSummary(rows)
}

// The planning dashboard used to scan all Cork planning rows on every request.
// Cache only compact facet summaries so the Next data-cache item stays small.
const getPlanningAggregateSummaryCached = unstable_cache(
  async () => getPlanningAggregateSummaryUncached(),
  ["planning-aggregate-summary", PLANNING_AGGREGATE_CACHE_VERSION],
  { revalidate: PLANNING_CACHE_REVALIDATE_SECONDS }
)

export async function getPlanningCommencementsPage(
  params: PlanningSearchParams = {}
): Promise<PlanningCommencementsPage> {
  const filters = normalisePlanningSearchParams(params)
  const selectedMetric = normaliseCommencementMetric(filters.commencementMetric)
  const selectedMonth = normaliseCommencementMonth(filters.month)
  const supabase = getServerSupabase()

  const allUnitsResult = await supabase
    .from("planning_commencements")
    .select(COMMENCEMENT_SELECT)
    .eq("local_authority_code", CORK_AUTHORITY_CODE)
    .eq("metric", "All Units")
    .gt("value", 0)
    .order("period_month", { ascending: false })
    .limit(COMMENCEMENT_MONTHS_BACK)

  if (allUnitsResult.error) {
    return {
      ...emptyCommencementsDashboard(),
      results: [],
      searchCount: 0,
      metricOptions: commencementMetricOptions(),
      monthOptions: [],
      selectedMonth,
    }
  }

  const allUnits = ((allUnitsResult.data ?? []) as PlanningCommencementRow[]).sort(
    (a, b) => b.period_month.localeCompare(a.period_month)
  )
  const latestMonth = allUnits[0]?.period_month ?? null
  const oldestMonth = allUnits.at(-1)?.period_month ?? null
  if (!latestMonth || !oldestMonth) {
    return {
      ...emptyCommencementsDashboard(),
      results: [],
      searchCount: 0,
      metricOptions: commencementMetricOptions(),
      monthOptions: [],
      selectedMonth,
    }
  }

  let rowsQuery = supabase
    .from("planning_commencements")
    .select(COMMENCEMENT_SELECT)
    .eq("local_authority_code", CORK_AUTHORITY_CODE)
    .gte("period_month", oldestMonth)
    .lte("period_month", latestMonth)
    .gt("value", 0)
    .order("period_month", { ascending: false })

  if (selectedMonth) {
    rowsQuery = rowsQuery.eq("period_month", `${selectedMonth}-01`)
  }

  const rowsResult = await rowsQuery.limit(COMMENCEMENT_MONTHS_BACK * COMMENCEMENT_METRICS.length)
  if (rowsResult.error) {
    return {
      ...emptyCommencementsDashboard(),
      results: [],
      searchCount: 0,
      metricOptions: commencementMetricOptions(),
      monthOptions: allUnits.map((row) => row.period_month.slice(0, 7)),
      selectedMonth,
    }
  }

  const rows = (rowsResult.data ?? []) as PlanningCommencementRow[]
  const selectedRows = rows
    .filter((row) => row.metric === selectedMetric)
    .sort((a, b) => b.period_month.localeCompare(a.period_month))
  const selectedRowsByMonth = new Map(
    selectedRows.map((row) => [row.period_month, row.value])
  )
  const months = selectedMonth
    ? rows
        .map((row) => row.period_month)
        .filter((month, index, values) => values.indexOf(month) === index)
        .sort((a, b) => b.localeCompare(a))
    : allUnits.map((row) => row.period_month)
  const results = months
    .filter((month) => selectedRowsByMonth.has(month))
    .map((month) =>
      commencementSummaryForMonth(rows, month, selectedRowsByMonth.get(month) ?? 0)
    )

  const latestUnitsRow = allUnits[0] ?? null
  const latestNotices =
    rows.find((row) => row.period_month === latestMonth && row.metric === "Notices")
      ?.value ?? 0
  const latestYear = latestUnitsRow?.year ?? null
  const yearToDateUnits = latestYear
    ? allUnits
        .filter((row) => row.year === latestYear && row.period_month <= latestMonth)
        .reduce((sum, row) => sum + row.value, 0)
    : 0
  const typeBreakdown = [
    { source: "Oneoffs", label: "One-off homes" },
    { source: "Scheme", label: "Scheme units" },
    { source: "Apartments", label: "Apartments" },
  ]
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
    latestUnits: latestUnitsRow.value,
    latestNotices,
    yearToDateUnits,
    selectedMetric,
    selectedMetricLabel: commencementMetricLabel(selectedMetric),
    recentCommencements: results.slice(0, 8),
    recentUnits: allUnits
      .slice(0, 12)
      .reverse()
      .map((row) => ({
        label: formatPlanningMonth(row.period_month),
        count: row.value,
      })),
    typeBreakdown,
    sourceUrl: rows[0]?.source_url ?? latestUnitsRow.source_url ?? null,
    results,
    searchCount: results.length,
    metricOptions: commencementMetricOptions(),
    monthOptions: allUnits.map((row) => row.period_month.slice(0, 7)),
    selectedMonth,
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

function commencementMetricOptions() {
  return COMMENCEMENT_METRICS.map((metric) => ({
    value: metric.source === "All Units" ? "" : metric.source,
    label: metric.label,
  }))
}

function normaliseCommencementMonth(value: string) {
  const month = cleanParam(value)
  return /^\d{4}-\d{2}$/.test(month) ? month : ""
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
    query = query.ilike("location", `%${escapePostgrestLike(filters.area)}%`)
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

function buildPlanningAggregateSummary(
  rows: PlanningAggregateRow[],
  totalCount = rows.length
): PlanningAggregateSummary {
  const areaStats = countBy(rows, normaliseAreaName).slice(0, 12)
  const statusStats = countBy(rows, (row) => row.status).slice(0, 8)
  const typeStats = countBy(rows, (row) => row.application_type).slice(0, 8)

  return {
    totalCount,
    latestRegistrationDate: firstKnownValue(rows, (row) => row.registration_date),
    areaStats,
    statusStats,
    typeStats,
    monthStats: countByMonth(rows).slice(0, 12).reverse(),
    areaOptions: countBy(rows, normaliseAreaName)
      .slice(0, PLANNING_AREA_OPTION_LIMIT)
      .map((stat) => stat.label),
    statusOptions: countBy(rows, (row) => row.status).map((stat) => stat.label),
    typeOptions: countBy(rows, (row) => row.application_type).map((stat) => stat.label),
    activeArea: areaStats[0] ?? null,
  }
}

function planningApplicationToAggregateRow(
  application: PlanningApplication
): PlanningAggregateRow {
  return {
    reference: application.reference,
    proposal: application.proposal,
    ward: application.ward,
    location: application.location,
    applicant_name: application.applicant_name,
    status: application.status,
    application_type: application.application_type,
    registration_date: application.registration_date,
  }
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
  const locality = normaliseLocationLocality(row.location)
  if (locality) return locality

  const ward = cleanLabel(row.ward)
  if (ward) {
    return ward
      .replace(/^Municipal Districts:\s*/i, "")
      .replace(/^Municipal District of\s*/i, "")
      .replace(/^The Municipal District of\s*/i, "")
  }

  return ""
}

function normaliseLocationLocality(value: string | null | undefined) {
  const location = cleanLabel(value)
    .replace(/\b[A-Z]\d{2}\s?[A-Z0-9]{4}\b/gi, "")
    .replace(/\bcounty\s+cork\b\.?/gi, "")
    .replace(/\bco\.?\s*cork\b\.?/gi, "")
    .replace(/\bcork\b\.?$/i, "")
    .replace(/\s+/g, " ")
    .trim()

  if (!location) return ""

  const matchedLocality = CORK_LOCALITY_NAMES.find((locality) =>
    new RegExp(`\\b${escapeRegExp(locality)}\\b`, "i").test(location)
  )
  if (matchedLocality) return matchedLocality

  const locationParts = location
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .filter((part) => !/^\d+$/.test(part))

  return locationParts.at(-1) ?? location
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}
