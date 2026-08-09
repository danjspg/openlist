import { unstable_cache } from "next/cache"
import { cache } from "react"
import {
  getPlanningAuthorityByCode,
  PLANNING_AUTHORITIES,
  type PlanningAuthority,
} from "@/lib/planning-authorities"
import { planningReferenceFromSlug } from "@/lib/property-intelligence"
import { getServerSupabase } from "@/lib/supabase"

export type PlanningApplication = {
  id: string
  local_authority: string
  local_authority_code: string
  reference: string
  web_reference: string | null
  application_type: string | null
  proposal: string | null
  location: string | null
  applicant_name: string | null
  agent_name: string | null
  status: string | null
  decision_text: string | null
  registration_date: string | null
  valid_date: string | null
  decision_date: string | null
  final_grant_date: string | null
  appeal_lodged_date: string | null
  appeal_decision_date: string | null
  dispatch_date: string | null
  ward: string | null
  grid_reference: string | null
  grid_easting: number | string | null
  grid_northing: number | string | null
  source_url: string | null
  updated_at: string | null
}

export type PlanningCountStat = {
  label: string
  count: number
}

export type PlanningMapPoint = {
  label: string
  count: number
  x: number
  y: number
}

export type PlanningDashboard = {
  authority: PlanningAuthority | null
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
  mapPoints: PlanningMapPoint[]
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
  | "mapPoints"
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
  council?: string
  status?: string
  type?: string
}

const PLANNING_AGGREGATE_PAGE_SIZE = 1000
const PLANNING_CACHE_REVALIDATE_SECONDS = 60 * 60 * 6
const PLANNING_AGGREGATE_CACHE_VERSION = "v7"
const PLANNING_AREA_OPTION_LIMIT = 80
const PLANNING_MAP_POINT_LIMIT = 28
export const PLANNING_APPLICATION_SELECT =
  "id,local_authority,local_authority_code,reference,web_reference,application_type,proposal,location,applicant_name,agent_name,status,decision_text,registration_date,valid_date,decision_date,final_grant_date,appeal_lodged_date,appeal_decision_date,dispatch_date,ward,grid_reference,grid_easting,grid_northing,source_url,updated_at"
const AUTHORITY_COUNTY_SUFFIXES: Record<string, string[]> = {
  CORKCOCO: ["Cork"],
  CORKCITY: ["Cork"],
  KILDARE: ["Kildare"],
  GALWAYCOCO: ["Galway"],
  GALWAYCITY: ["Galway"],
  MEATH: ["Meath"],
  WICKLOW: ["Wicklow"],
  LIMERICK: ["Limerick"],
  WATERFORD: ["Waterford"],
  DONEGAL: ["Donegal"],
  WEXFORD: ["Wexford"],
  TIPPERARY: ["Tipperary"],
  KERRY: ["Kerry"],
  MAYO: ["Mayo"],
  CLARE: ["Clare"],
  LOUTH: ["Louth"],
  LAOIS: ["Laois"],
  KILKENNY: ["Kilkenny"],
  OFFALY: ["Offaly"],
  CAVAN: ["Cavan"],
  ROSCOMMON: ["Roscommon"],
  WESTMEATH: ["Westmeath"],
  MONAGHAN: ["Monaghan"],
  SLIGO: ["Sligo"],
  CARLOW: ["Carlow"],
  LONGFORD: ["Longford"],
  LEITRIM: ["Leitrim"],
}
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
  local_authority: string | null
  local_authority_code: string | null
  proposal: string | null
  ward: string | null
  location: string | null
  applicant_name: string | null
  status: string | null
  application_type: string | null
  registration_date: string | null
  grid_easting: number | string | null
  grid_northing: number | string | null
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
    council: cleanParam(params.council),
    status: cleanParam(params.status),
    type: cleanParam(params.type),
  }
}

export async function getPlanningDashboard(
  params: PlanningSearchParams = {},
  authority: PlanningAuthority | null = null
): Promise<PlanningDashboard> {
  const filters = normalisePlanningSearchParams(params)
  const supabase = getServerSupabase()
  const authorityCode = authority?.code ?? null
  const selectedCouncilCode = authorityCode
    ? null
    : getAuthorityCodeByOptionLabel(filters.council)
  const aggregateAuthorityCode = authorityCode ?? selectedCouncilCode
  const hasApplicationFilters = Boolean(
    filters.q || filters.area || filters.council || filters.status || filters.type
  )
  const hasFacetFilters = Boolean(filters.q || filters.area || filters.status || filters.type)

  let recentQuery = supabase
    .from("planning_applications")
    .select(PLANNING_APPLICATION_SELECT)
    .order("registration_date", { ascending: false })
    .order("reference", { ascending: false })
    .limit(8)

  if (authorityCode) {
    recentQuery = recentQuery.eq("local_authority_code", authorityCode)
  } else if (selectedCouncilCode) {
    recentQuery = recentQuery.eq("local_authority_code", selectedCouncilCode)
  }

  const needsNationalCouncilOptions = !authority && aggregateAuthorityCode
  const [recentResult, overview, nationalOverview, searchResult, filteredOverview] =
    await Promise.all([
      recentQuery,
      getPlanningAggregateSummaryCached(aggregateAuthorityCode ?? "NATIONAL"),
      needsNationalCouncilOptions
        ? getPlanningAggregateSummaryCached("NATIONAL")
        : Promise.resolve(null),
      hasApplicationFilters
        ? getPlanningSearchResults(filters, authorityCode)
        : Promise.resolve({ results: [] as PlanningApplication[], count: 0 }),
      hasFacetFilters
        ? getFilteredPlanningAggregateSummary(filters, aggregateAuthorityCode)
        : Promise.resolve(null),
    ])
  const filteredSummary = filteredOverview ?? overview

  return {
    authority,
    totalCount: hasApplicationFilters ? filteredSummary.totalCount : overview.totalCount,
    latestRegistrationDate: hasApplicationFilters
      ? filteredSummary.latestRegistrationDate
      : overview.latestRegistrationDate,
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
    mapPoints: filteredSummary.mapPoints,
    latestMonthAreaStats: filteredSummary.latestMonthAreaStats,
    latestMonthStatusStats: filteredSummary.latestMonthStatusStats,
    latestMonthTypeStats: filteredSummary.latestMonthTypeStats,
    areaOptions: nationalOverview?.areaOptions ?? overview.areaOptions,
    statusOptions: overview.statusOptions,
    typeOptions: overview.typeOptions,
    activeArea: filteredSummary.activeArea,
  }
}

export const getPlanningApplication = cache(async function getPlanningApplication(
  authority: PlanningAuthority,
  referenceSlug: string
) {
  const reference = planningReferenceFromSlug(referenceSlug)
  if (!reference) return null

  const { data, error } = await getServerSupabase()
    .from("planning_applications")
    .select(PLANNING_APPLICATION_SELECT)
    .eq("local_authority_code", authority.code)
    .eq("reference", reference)
    .maybeSingle()

  if (error || !data) return null
  return data as PlanningApplication
})

export async function getPlanningSitemapApplications(limit = 5000) {
  type SitemapApplication = {
    local_authority_code: string
    reference: string
    updated_at: string | null
  }
  const applications: SitemapApplication[] = []
  const pageSize = 1000

  for (let from = 0; from < limit; from += pageSize) {
    const to = Math.min(from + pageSize - 1, limit - 1)
    const { data, error } = await getServerSupabase()
      .from("planning_applications")
      .select("local_authority_code,reference,updated_at")
      .order("registration_date", { ascending: false })
      .order("reference", { ascending: false })
      .range(from, to)

    if (error || !data) break
    applications.push(...(data as SitemapApplication[]))
    if (data.length < pageSize) break
  }

  return applications
}

async function getPlanningAggregateRows(authorityCode: string) {
  const supabase = getServerSupabase()
  const rows: PlanningAggregateRow[] = []
  const isNational = authorityCode === "NATIONAL"

  for (let from = 0; ; from += PLANNING_AGGREGATE_PAGE_SIZE) {
    const to = from + PLANNING_AGGREGATE_PAGE_SIZE - 1
    let query = supabase
      .from("planning_applications")
      .select(
        "reference,local_authority,local_authority_code,proposal,ward,location,applicant_name,status,application_type,registration_date,grid_easting,grid_northing"
      )
      .order("registration_date", { ascending: false })
      .range(from, to)

    if (!isNational) {
      query = query.eq("local_authority_code", authorityCode)
    }

    const { data, error } = await query

    if (error) break

    const page = (data ?? []) as PlanningAggregateRow[]
    rows.push(...page)
    if (page.length < PLANNING_AGGREGATE_PAGE_SIZE) break
  }

  return rows
}

async function getPlanningAggregateSummaryUncached(authorityCode: string) {
  const rows = await getPlanningAggregateRows(authorityCode)
  return buildPlanningAggregateSummary(
    rows,
    rows.length,
    authorityCode === "NATIONAL" ? "authority" : "locality"
  )
}

async function getFilteredPlanningAggregateSummary(
  filters: Required<PlanningSearchParams>,
  authorityCode: string | null
) {
  const rows = await getPlanningAggregateRows(authorityCode ?? "NATIONAL")
  const areaMode = authorityCode ? "locality" : "authority"
  const filteredRows = filterPlanningAggregateRows(rows, filters, areaMode)

  return buildPlanningAggregateSummary(filteredRows, filteredRows.length, areaMode)
}

// The planning dashboard used to scan all Cork planning rows on every request.
// Cache only compact facet summaries so the Next data-cache item stays small.
const getPlanningAggregateSummaryCached = unstable_cache(
  async (authorityCode: string) => getPlanningAggregateSummaryUncached(authorityCode),
  ["planning-aggregate-summary", PLANNING_AGGREGATE_CACHE_VERSION],
  { revalidate: PLANNING_CACHE_REVALIDATE_SECONDS }
)

function filterPlanningAggregateRows(
  rows: PlanningAggregateRow[],
  filters: Required<PlanningSearchParams>,
  areaMode: "authority" | "locality"
) {
  const q = filters.q.toLocaleLowerCase()

  return rows.filter((row) => {
    if (q) {
      const searchableText = [
        row.reference,
        row.proposal,
        row.location,
        row.applicant_name,
      ]
        .map((value) => cleanLabel(value).toLocaleLowerCase())
        .join(" ")

      if (!searchableText.includes(q)) return false
    }

    if (filters.area) {
      const areaLabel =
        areaMode === "authority" ? normaliseAuthorityAreaName(row) : normaliseAreaName(row)
      const location = cleanLabel(row.location).toLocaleLowerCase()
      const area = filters.area.toLocaleLowerCase()

      if (
        areaLabel.toLocaleLowerCase() !== area &&
        !location.includes(area)
      ) {
        return false
      }
    }

    if (filters.status && row.status !== filters.status) return false
    if (filters.type && row.application_type !== filters.type) return false

    return true
  })
}

async function getPlanningSearchResults(
  filters: Required<PlanningSearchParams>,
  authorityCode: string | null
) {
  const supabase = getServerSupabase()
  let query = supabase
    .from("planning_applications")
    .select(PLANNING_APPLICATION_SELECT, { count: "exact" })

  if (authorityCode) {
    query = query.eq("local_authority_code", authorityCode)
  } else if (filters.council) {
    const councilCode = getAuthorityCodeByOptionLabel(filters.council)
    if (councilCode) {
      query = query.eq("local_authority_code", councilCode)
    }
  }

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
  totalCount = rows.length,
  areaMode: "authority" | "locality" = "locality"
): PlanningAggregateSummary {
  const areaLabelForRow =
    areaMode === "authority" ? normaliseAuthorityAreaName : normaliseAreaName
  const areaStats = countBy(rows, areaLabelForRow).slice(0, 12)
  const statusStats = countBy(rows, (row) => row.status).slice(0, 8)
  const typeStats = countBy(rows, (row) => row.application_type).slice(0, 8)
  const mapPoints = buildPlanningMapPoints(rows, areaLabelForRow)
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
    mapPoints,
    latestMonthAreaStats: countBy(latestMonthRows, areaLabelForRow).slice(0, 8),
    latestMonthStatusStats: countBy(latestMonthRows, (row) => row.status).slice(0, 6),
    latestMonthTypeStats: countBy(latestMonthRows, (row) =>
      row.application_type
    ).slice(0, 6),
    areaOptions:
      areaMode === "authority"
        ? buildAuthorityOptions(rows)
        : countBy(rows, normaliseAreaName)
            .slice(0, PLANNING_AREA_OPTION_LIMIT)
            .map((stat) => stat.label),
    statusOptions: countBy(rows, (row) => row.status).map((stat) => stat.label),
    typeOptions: countBy(rows, (row) => row.application_type).map((stat) => stat.label),
    activeArea: areaStats[0] ?? null,
  }
}

function buildPlanningMapPoints(
  rows: PlanningAggregateRow[],
  getLabel: (row: PlanningAggregateRow) => string | null | undefined
): PlanningMapPoint[] {
  const groups = new Map<
    string,
    { label: string; count: number; eastingTotal: number; northingTotal: number }
  >()

  for (const row of rows) {
    const label = cleanLabel(getLabel(row))
    if (
      row.grid_easting === null ||
      row.grid_easting === "" ||
      row.grid_northing === null ||
      row.grid_northing === ""
    ) {
      continue
    }

    const easting = Number(row.grid_easting)
    const northing = Number(row.grid_northing)

    if (!label || !Number.isFinite(easting) || !Number.isFinite(northing)) continue

    const group = groups.get(label) ?? {
      label,
      count: 0,
      eastingTotal: 0,
      northingTotal: 0,
    }

    group.count += 1
    group.eastingTotal += easting
    group.northingTotal += northing
    groups.set(label, group)
  }

  const averagedPoints = [...groups.values()]
    .map((group) => ({
      label: group.label,
      count: group.count,
      easting: group.eastingTotal / group.count,
      northing: group.northingTotal / group.count,
    }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
    .slice(0, PLANNING_MAP_POINT_LIMIT)

  if (averagedPoints.length === 0) return []

  const eastings = averagedPoints.map((point) => point.easting)
  const northings = averagedPoints.map((point) => point.northing)
  const minEasting = Math.min(...eastings)
  const maxEasting = Math.max(...eastings)
  const minNorthing = Math.min(...northings)
  const maxNorthing = Math.max(...northings)
  const eastingSpan = Math.max(maxEasting - minEasting, 1)
  const northingSpan = Math.max(maxNorthing - minNorthing, 1)

  return averagedPoints.map((point) => ({
    label: point.label,
    count: point.count,
    x: ((point.easting - minEasting) / eastingSpan) * 100,
    y: 100 - ((point.northing - minNorthing) / northingSpan) * 100,
  }))
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
  const locality = normaliseLocationLocality(row)
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

function normaliseAuthorityAreaName(row: PlanningAggregateRow) {
  const authority = row.local_authority_code
    ? getPlanningAuthorityByCode(row.local_authority_code)
    : null

  return authority?.shortName ?? cleanLabel(row.local_authority)
}

function buildAuthorityOptions(rows: PlanningAggregateRow[]) {
  const presentCodes = new Set(
    rows
      .map((row) => cleanLabel(row.local_authority_code))
      .filter(Boolean)
  )

  return PLANNING_AUTHORITIES.filter((authority) => presentCodes.has(authority.code)).map(
    (authority) => authority.shortName
  )
}

function getAuthorityCodeByOptionLabel(label: string) {
  const cleanedLabel = cleanLabel(label)
  return (
    PLANNING_AUTHORITIES.find(
      (authority) =>
        authority.shortName === cleanedLabel ||
        authority.name === cleanedLabel ||
        authority.code === cleanedLabel
    )?.code ?? null
  )
}

function normaliseLocationLocality(row: PlanningAggregateRow) {
  const location = stripAuthorityCountySuffixes(
    cleanLabel(row.location)
    .replace(/\b[A-Z]\d{2}\s?[A-Z0-9]{4}\b/gi, "")
      .replace(/\bcounty\s+cork\b\.?/gi, "")
      .replace(/\bco\.?\s*cork\b\.?/gi, "")
      .replace(/\bcork\b\.?$/i, ""),
    row.local_authority_code
  )

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

function stripAuthorityCountySuffixes(
  value: string,
  authorityCode: string | null | undefined
) {
  let location = value
  const countyNames = authorityCode
    ? AUTHORITY_COUNTY_SUFFIXES[authorityCode] ?? []
    : []

  for (const countyName of countyNames) {
    const countyPattern = escapeRegExp(countyName)

    location = location
      .replace(new RegExp(`\\bcounty\\s+${countyPattern}\\b\\.?`, "gi"), "")
      .replace(new RegExp(`\\bco\\.?\\s*${countyPattern}\\b\\.?`, "gi"), "")
      .replace(new RegExp(`,\\s*${countyPattern}\\b\\.?$`, "i"), "")

    if (new RegExp(`^${countyPattern}\\.?$`, "i").test(location.trim())) {
      location = ""
    }
  }

  return location
    .replace(/\s*,\s*/g, ", ")
    .replace(/^[,\s.]+|[,\s.]+$/g, "")
    .replace(/\s+/g, " ")
    .trim()
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}
