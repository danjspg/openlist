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

export type PlanningDashboard = {
  totalCount: number
  latestRegistrationDate: string | null
  latestRegistrationMonth: string | null
  latestMonthCount: number
  previousMonthCount: number | null
  latestMonthChange: number | null
  recentApplications: PlanningApplication[]
  searchResults: PlanningApplication[]
  searchCount: number
  areaStats: PlanningCountStat[]
  statusStats: PlanningCountStat[]
  typeStats: PlanningCountStat[]
  monthStats: PlanningCountStat[]
  latestMonthAreaStats: PlanningCountStat[]
  latestMonthStatusStats: PlanningCountStat[]
  latestMonthTypeStats: PlanningCountStat[]
  areaOptions: string[]
  statusOptions: string[]
  typeOptions: string[]
  activeArea: PlanningCountStat | null
}

type PlanningAggregateSummary = Pick<
  PlanningDashboard,
  | "totalCount"
  | "latestRegistrationDate"
  | "latestRegistrationMonth"
  | "latestMonthCount"
  | "previousMonthCount"
  | "latestMonthChange"
  | "areaStats"
  | "statusStats"
  | "typeStats"
  | "monthStats"
  | "latestMonthAreaStats"
  | "latestMonthStatusStats"
  | "latestMonthTypeStats"
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
}

const CORK_AUTHORITY_CODE = "CORKCOCO"
const PLANNING_AGGREGATE_PAGE_SIZE = 1000
const PLANNING_CACHE_REVALIDATE_SECONDS = 60 * 60 * 6
const PLANNING_AGGREGATE_CACHE_VERSION = "v2"
const PLANNING_AREA_OPTION_LIMIT = 80
const APPLICATION_SELECT =
  "id,reference,application_type,proposal,location,applicant_name,agent_name,status,decision_text,registration_date,decision_date,final_grant_date,ward,source_url"
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
    latestRegistrationMonth: filteredSummary.latestRegistrationMonth,
    latestMonthCount: filteredSummary.latestMonthCount,
    previousMonthCount: filteredSummary.previousMonthCount,
    latestMonthChange: filteredSummary.latestMonthChange,
    recentApplications: (recentResult.data ?? []) as PlanningApplication[],
    searchResults: searchResult.results,
    searchCount: searchResult.count,
    areaStats: filteredSummary.areaStats,
    statusStats: filteredSummary.statusStats,
    typeStats: filteredSummary.typeStats,
    monthStats: filteredSummary.monthStats,
    latestMonthAreaStats: filteredSummary.latestMonthAreaStats,
    latestMonthStatusStats: filteredSummary.latestMonthStatusStats,
    latestMonthTypeStats: filteredSummary.latestMonthTypeStats,
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

function monthOffset(value: string, offset: number) {
  const date = new Date(`${value}T00:00:00Z`)
  date.setUTCMonth(date.getUTCMonth() + offset)

  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(
    2,
    "0"
  )}-01`
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
  const monthStatsDescending = countByMonth(rows)
  const latestRegistrationDate = firstKnownValue(rows, (row) => row.registration_date)
  const latestRegistrationMonth = latestRegistrationDate?.slice(0, 7) ?? null
  const previousRegistrationMonth = latestRegistrationMonth
    ? monthOffset(`${latestRegistrationMonth}-01`, -1).slice(0, 7)
    : null
  const latestMonthRows = latestRegistrationMonth
    ? rows.filter((row) => row.registration_date?.startsWith(latestRegistrationMonth))
    : []
  const latestMonthCount = latestMonthRows.length
  const previousMonthCount = previousRegistrationMonth
    ? rows.filter((row) => row.registration_date?.startsWith(previousRegistrationMonth))
        .length
    : null

  return {
    totalCount,
    latestRegistrationDate,
    latestRegistrationMonth,
    latestMonthCount,
    previousMonthCount,
    latestMonthChange:
      previousMonthCount === null ? null : latestMonthCount - previousMonthCount,
    areaStats,
    statusStats,
    typeStats,
    monthStats: monthStatsDescending.slice(0, 12).reverse(),
    latestMonthAreaStats: countBy(latestMonthRows, normaliseAreaName).slice(0, 8),
    latestMonthStatusStats: countBy(latestMonthRows, (row) => row.status).slice(0, 6),
    latestMonthTypeStats: countBy(latestMonthRows, (row) =>
      row.application_type
    ).slice(0, 6),
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
