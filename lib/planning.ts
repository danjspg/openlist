import { unstable_cache } from "next/cache"
import { cache } from "react"
import {
  getPlanningAuthorityByCode,
  PLANNING_AUTHORITIES,
  type PlanningAuthority,
} from "@/lib/planning-authorities"
import { planningReferenceFromSlug } from "@/lib/property-intelligence"
import type { PlanningSitemapApplication } from "@/lib/planning-seo"
import type { PlanningEvent } from "@/lib/planning-events"
import type { PlanningStatus } from "@/lib/planning-status"
import { isCanonicalPlanningStatus } from "@/lib/planning-status"
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
  eircode: string | null
  eircode_prefix?: string | null
  applicant_name: string | null
  agent_name: string | null
  status: string | null
  normalized_status: PlanningStatus
  decision_text: string | null
  registration_date: string | null
  valid_date: string | null
  decision_date: string | null
  decision_due_date: string | null
  final_grant_date: string | null
  expiry_date: string | null
  further_information_requested_date: string | null
  further_information_received_date: string | null
  withdrawal_date: string | null
  appeal_lodged_date: string | null
  appeal_decision_date: string | null
  dispatch_date: string | null
  appeal_notify_date: string | null
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
  aggregateAvailable: boolean
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
  councilActivityStats: PlanningCountStat[]
  councilActivityPeriodStart: string | null
  councilActivityPeriodEnd: string | null
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
  sort?: string
}

const PLANNING_CACHE_REVALIDATE_SECONDS = 60 * 60 * 6
const PLANNING_DETAIL_CACHE_REVALIDATE = false
const PLANNING_AGGREGATE_CACHE_VERSION = "v10-council-activity-live"
export const PLANNING_APPLICATION_SELECT =
  "id,local_authority,local_authority_code,reference,web_reference,application_type,proposal,location,eircode,applicant_name,agent_name,status,normalized_status,decision_text,registration_date,valid_date,decision_date,decision_due_date,final_grant_date,expiry_date,further_information_requested_date,further_information_received_date,withdrawal_date,appeal_lodged_date,appeal_decision_date,dispatch_date,appeal_notify_date,ward,grid_reference,grid_easting,grid_northing,source_url,updated_at"

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
    sort: normalisePlanningSort(params.sort),
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
  const hasResultFilters = Boolean(
    filters.q || filters.area || filters.council || filters.status || filters.type
  )
  const hasFacetFilters = Boolean(filters.q || filters.area || filters.status || filters.type)
  const hasApplicationFilters = hasResultFilters || filters.sort === "oldest"
  const shouldLoadFilteredOverview = hasFacetFilters && !filters.q
  const needsNationalCouncilActivity =
    !authority && !selectedCouncilCode && !hasApplicationFilters

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
  const [recentResult, overviewResult, nationalOverview, searchResult, filteredOverview, councilActivity] =
    await Promise.all([
      recentQuery,
      getPlanningAggregateSummaryCached(aggregateAuthorityCode ?? "NATIONAL").catch(
        (error) => {
          console.warn("Planning dashboard aggregation unavailable; showing recent applications.", error)
          return null
        }
      ),
      needsNationalCouncilOptions
        ? getPlanningAggregateSummaryCached("NATIONAL")
        : Promise.resolve(null),
      hasApplicationFilters
        ? getPlanningSearchResults(filters, authorityCode)
        : Promise.resolve({ results: [] as PlanningApplication[], count: 0 }),
      shouldLoadFilteredOverview
        ? getFilteredPlanningAggregateSummary(filters, aggregateAuthorityCode).catch(
            (error) => {
              console.warn("Planning filtered aggregation failed; using scoped overview.", error)
              return null
            }
          )
        : Promise.resolve(null),
      needsNationalCouncilActivity
        ? getNationalCouncilActivityCached()
        : Promise.resolve(null),
    ])
  const overview = overviewResult ?? emptyPlanningAggregateSummary()
  const filteredSummary = filteredOverview ?? overview
  const areaStats = needsNationalCouncilActivity
    ? councilActivity?.stats ?? []
    : filteredSummary.areaStats

  return {
    authority,
    aggregateAvailable: overviewResult !== null,
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
    areaStats,
    councilActivityStats: councilActivity?.stats ?? [],
    councilActivityPeriodStart: councilActivity?.periodStart ?? null,
    councilActivityPeriodEnd: councilActivity?.periodEnd ?? null,
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
    activeArea: areaStats[0] ?? null,
  }
}

function emptyPlanningAggregateSummary(): PlanningAggregateSummary {
  return {
    totalCount: 0,
    latestRegistrationDate: null,
    latestRegistrationMonth: null,
    latestMonthCount: 0,
    previousMonthCount: null,
    latestMonthChange: null,
    areaStats: [],
    statusStats: [],
    typeStats: [],
    monthStats: [],
    mapPoints: [],
    latestMonthAreaStats: [],
    latestMonthStatusStats: [],
    latestMonthTypeStats: [],
    areaOptions: [],
    statusOptions: [],
    typeOptions: [],
    activeArea: null,
  }
}

type PlanningCouncilActivityWindow = {
  periodStart: string | null
  periodEnd: string | null
  stats: PlanningCountStat[]
}

const getNationalCouncilActivityCached = unstable_cache(
  async (): Promise<PlanningCouncilActivityWindow | null> => {
    const { data, error } = await getServerSupabase().rpc(
      "openlist_planning_council_activity_12m"
    )
    if (error || !data) return null

    const value = data as Partial<PlanningCouncilActivityWindow>
    return {
      periodStart: value.periodStart ?? null,
      periodEnd: value.periodEnd ?? null,
      stats: (value.stats ?? []).map((stat) => ({
        label: getPlanningAuthorityByCode(String(stat.label))?.shortName ?? String(stat.label),
        count: Number(stat.count),
      })),
    }
  },
  ["planning-council-activity-12m", PLANNING_AGGREGATE_CACHE_VERSION],
  { revalidate: PLANNING_CACHE_REVALIDATE_SECONDS }
)

const getPlanningApplicationCached = unstable_cache(async function getPlanningApplicationUncached(
  authorityCode: string,
  reference: string
) {
  const { data, error } = await getServerSupabase()
    .from("planning_applications")
    .select(PLANNING_APPLICATION_SELECT)
    .eq("local_authority_code", authorityCode)
    .eq("reference", reference)
    .maybeSingle()

  if (error) throw new Error(`Planning application query failed: ${error.message}`)
  if (!data) return null
  return data as PlanningApplication
}, ["planning-application", "v4-lifecycle"], {
  revalidate: PLANNING_DETAIL_CACHE_REVALIDATE,
})

export const getPlanningApplication = cache(async function getPlanningApplication(
  authority: PlanningAuthority,
  referenceSlug: string
) {
  const reference = planningReferenceFromSlug(referenceSlug)
  if (!reference) return null
  return getPlanningApplicationCached(authority.code, reference)
})

const getPlanningApplicationEventsCached = unstable_cache(
  async function getPlanningApplicationEventsUncached(applicationId: string) {
    const { data, error } = await getServerSupabase()
      .from("planning_application_events")
      .select(
        "id,application_id,event_type,event_date,detected_at,event_source,source_field,label,old_value,new_value,raw_source_value,provenance,event_key"
      )
      .eq("application_id", applicationId)
      .order("event_date", { ascending: true })
      .order("detected_at", { ascending: true })
      .order("event_type", { ascending: true })
      .order("id", { ascending: true })

    if (error) throw new Error(`Planning timeline query failed: ${error.message}`)
    return (data ?? []) as PlanningEvent[]
  },
  ["planning-application-events", "v1"],
  { revalidate: PLANNING_DETAIL_CACHE_REVALIDATE }
)

export const getPlanningApplicationEvents = cache(
  async function getPlanningApplicationEvents(applicationId: string) {
    return getPlanningApplicationEventsCached(applicationId)
  }
)

export async function getPlanningSitemapApplications(limit = 5000) {
  const boundedLimit = Math.max(1, Math.min(limit, 5000))
  const serverSupabase = getServerSupabase()
  const selected: PlanningSitemapApplication[] = []
  let selectionError: { message: string } | null = null

  for (let offset = 0; offset < boundedLimit; offset += 1000) {
    const { data, error } = await serverSupabase.rpc(
      "openlist_planning_recent_sitemap",
      { p_limit: Math.min(1000, boundedLimit - offset), p_offset: offset }
    )
    if (error || !data) {
      selectionError = error
      break
    }
    selected.push(...(data as PlanningSitemapApplication[]))
    if (data.length < Math.min(1000, boundedLimit - offset)) break
  }

  if (!selectionError) {
    return selected
  }

  console.warn(
    "Planning sitemap selection RPC unavailable; using deterministic direct-query fallback.",
    selectionError?.message
  )
  const applications: PlanningSitemapApplication[] = []
  const pageSize = 1000

  for (let from = 0; from < boundedLimit; from += pageSize) {
    const to = Math.min(from + pageSize - 1, boundedLimit - 1)
    const { data, error } = await serverSupabase
      .from("planning_applications")
      .select("id,local_authority_code,reference,registration_date,updated_at")
      .not("registration_date", "is", null)
      .order("registration_date", { ascending: false, nullsFirst: false })
      .order("reference", { ascending: false })
      .order("id", { ascending: false })
      .range(from, to)

    if (error || !data) break
    applications.push(...(data as PlanningSitemapApplication[]))
    if (data.length < pageSize) break
  }

  return applications
}

export async function getNotablePlanningSitemapApplications(limit = 5000) {
  const boundedLimit = Math.max(1, Math.min(limit, 5000))
  const serverSupabase = getServerSupabase()
  const applications: PlanningSitemapApplication[] = []

  for (let offset = 0; offset < boundedLimit; offset += 1000) {
    const pageLimit = Math.min(1000, boundedLimit - offset)
    const { data, error } = await serverSupabase.rpc(
      "openlist_planning_notable_sitemap",
      { p_limit: pageLimit, p_offset: offset }
    )
    if (error || !data) {
      console.warn("Notable planning sitemap selection failed.", error?.message)
      return []
    }
    applications.push(...(data as PlanningSitemapApplication[]))
    if (data.length < pageLimit) break
  }

  return applications
}

async function getFilteredPlanningAggregateSummary(
  filters: Required<PlanningSearchParams>,
  authorityCode: string | null
) {
  return getPlanningAggregateSummaryCached(
    authorityCode ?? "NATIONAL",
    filters.q,
    filters.area,
    filters.status,
    filters.type
  )
}

// Postgres filters and aggregates the matching rows. Only the compact JSON summary
// crosses the network; no planning dataset is downloaded into the Vercel function.
const getPlanningAggregateSummaryCached = unstable_cache(
  async (
    authorityCode: string,
    q = "",
    area = "",
    status = "",
    applicationType = ""
  ) => {
    const { data, error } = await getServerSupabase().rpc(
      "openlist_planning_dashboard_aggregate",
      {
        p_authority_code: authorityCode === "NATIONAL" ? null : authorityCode,
        p_q: q || null,
        p_area: area || null,
        p_status: status || null,
        p_application_type: applicationType || null,
      }
    )

    if (error || !data) {
      throw new Error(
        `Planning dashboard aggregation failed: ${error?.message ?? "empty response"}`
      )
    }

    return normaliseDatabaseAggregateSummary(data, authorityCode)
  },
  ["planning-aggregate-summary", PLANNING_AGGREGATE_CACHE_VERSION],
  { revalidate: PLANNING_CACHE_REVALIDATE_SECONDS }
)

function normaliseDatabaseAggregateSummary(
  value: unknown,
  authorityCode: string
): PlanningAggregateSummary {
  const summary = value as Partial<PlanningAggregateSummary>
  const normaliseAuthorityLabel = (label: string) =>
    authorityCode === "NATIONAL"
      ? getPlanningAuthorityByCode(label)?.shortName ?? label
      : label
  const normaliseStats = (stats: PlanningCountStat[] | undefined) =>
    (stats ?? []).map((stat) => ({
      label: normaliseAuthorityLabel(String(stat.label)),
      count: Number(stat.count),
    }))
  const areaStats = normaliseStats(summary.areaStats)

  return {
    totalCount: Number(summary.totalCount ?? 0),
    latestRegistrationDate: summary.latestRegistrationDate ?? null,
    latestRegistrationMonth: summary.latestRegistrationMonth ?? null,
    latestMonthCount: Number(summary.latestMonthCount ?? 0),
    previousMonthCount:
      summary.previousMonthCount === null || summary.previousMonthCount === undefined
        ? null
        : Number(summary.previousMonthCount),
    latestMonthChange:
      summary.latestMonthChange === null || summary.latestMonthChange === undefined
        ? null
        : Number(summary.latestMonthChange),
    areaStats,
    statusStats: normaliseStats(summary.statusStats),
    typeStats: normaliseStats(summary.typeStats),
    monthStats: (summary.monthStats ?? []).map((stat) => ({
      label: String(stat.label),
      count: Number(stat.count),
    })),
    mapPoints: (summary.mapPoints ?? []).map((point) => ({
      label: normaliseAuthorityLabel(String(point.label)),
      count: Number(point.count),
      x: Number(point.x),
      y: Number(point.y),
    })),
    latestMonthAreaStats: normaliseStats(summary.latestMonthAreaStats),
    latestMonthStatusStats: normaliseStats(summary.latestMonthStatusStats),
    latestMonthTypeStats: normaliseStats(summary.latestMonthTypeStats),
    areaOptions: (summary.areaOptions ?? []).map((label) =>
      normaliseAuthorityLabel(String(label))
    ),
    statusOptions: (summary.statusOptions ?? []).map(String),
    typeOptions: (summary.typeOptions ?? []).map(String),
    activeArea: areaStats[0] ?? null,
  }
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
    query = isCanonicalPlanningStatus(filters.status)
      ? query.eq("normalized_status", filters.status)
      : query.eq("status", filters.status)
  }

  if (filters.type) {
    query = query.eq("application_type", filters.type)
  }

  const ascending = filters.sort === "oldest"
  const { data, count } = await query
    .order("registration_date", { ascending, nullsFirst: false })
    .order("reference", { ascending })
    .limit(25)

  return {
    results: (data ?? []) as PlanningApplication[],
    count: count ?? data?.length ?? 0,
  }
}

function cleanParam(value: string | undefined) {
  return (value ?? "").trim().slice(0, 120)
}

function normalisePlanningSort(value: string | undefined) {
  return value === "oldest" ? "oldest" : "newest"
}

function escapePostgrestLike(value: string) {
  return value.replace(/[,%]/g, " ").replace(/\s+/g, " ").trim()
}

function cleanLabel(value: string | null | undefined) {
  return value?.replace(/\s+/g, " ").trim() ?? ""
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
