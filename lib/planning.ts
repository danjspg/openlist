import { unstable_cache } from "next/cache"
import { cache } from "react"
import { PLANNING_DATASET_CACHE_TAG } from "@/lib/dataset-cache"
import {
  getPlanningAuthorityByCode,
  PLANNING_AUTHORITIES,
  type PlanningAuthority,
} from "@/lib/planning-authorities"
import { planningReferenceFromSlug } from "@/lib/property-intelligence"
import type { PlanningSitemapApplication } from "@/lib/planning-seo"
import type { PlanningEvent } from "@/lib/planning-events"
import type { PlanningStatus } from "@/lib/planning-status"
import { normalisePlanningStatus, PLANNING_STATUS_OPTIONS } from "@/lib/planning-status"
import {
  PLANNING_APPLICATION_TYPE_GROUPS,
  planningApplicationTypeValues,
} from "@/lib/planning-application-type"
import { getOptionalServerSupabase, getServerSupabase } from "@/lib/supabase"

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
  appeal_decision_text: string | null
  appeal_lodged_source?: string | null
  appeal_decision_source?: string | null
  dispatch_date: string | null
  appeal_notify_date: string | null
  ward: string | null
  grid_reference: string | null
  grid_easting: number | string | null
  grid_northing: number | string | null
  source_url: string | null
  updated_at: string | null
  construction_status?: "commenced" | "completed" | null
  construction_evidence_date?: string | null
  construction_evidence_source?: string | null
  construction_evidence_detail?: string | null
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
  construction?: string
  sort?: string
}

const PLANNING_CACHE_REVALIDATE_SECONDS = 60 * 60 * 6
const PLANNING_DETAIL_CACHE_REVALIDATE = false
const PLANNING_AGGREGATE_CACHE_VERSION = "v11-dataset-publication"
export const PLANNING_APPLICATION_SELECT =
  "id,local_authority,local_authority_code,reference,web_reference,application_type,proposal,location,eircode,applicant_name,agent_name,status,normalized_status,decision_text,registration_date,valid_date,decision_date,decision_due_date,final_grant_date,expiry_date,further_information_requested_date,further_information_received_date,withdrawal_date,appeal_lodged_date,appeal_decision_date,appeal_decision_text,appeal_lodged_source,appeal_decision_source,dispatch_date,appeal_notify_date,ward,grid_reference,grid_easting,grid_northing,source_url,updated_at,construction_status,construction_evidence_date,construction_evidence_source,construction_evidence_detail"

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
    construction: params.construction === "commenced" ? "commenced" : "",
    sort: normalisePlanningSort(params.sort),
  }
}

export async function getPlanningDashboard(
  params: PlanningSearchParams = {},
  authority: PlanningAuthority | null = null
): Promise<PlanningDashboard> {
  const filters = normalisePlanningSearchParams(params)
  const authorityCode = authority?.code ?? null
  const selectedCouncilCode = authorityCode
    ? null
    : getAuthorityCodeByOptionLabel(filters.council)
  const aggregateAuthorityCode = authorityCode ?? selectedCouncilCode
  const hasResultFilters = Boolean(
    filters.q || filters.area || filters.council || filters.status || filters.type || filters.construction
  )
  const hasApplicationFilters = hasResultFilters || filters.sort === "oldest"
  const needsNationalCouncilActivity =
    !authority && !selectedCouncilCode && !hasApplicationFilters

  const [recentApplications, overviewResult, searchResult, councilActivity] =
    await Promise.all([
      hasApplicationFilters
        ? Promise.resolve([] as PlanningApplication[])
        : getRecentPlanningApplicationsCached(aggregateAuthorityCode ?? "NATIONAL").catch(
            () => [] as PlanningApplication[]
          ),
      hasApplicationFilters
        ? Promise.resolve(null)
        : getPlanningAggregateSummaryCached(aggregateAuthorityCode ?? "NATIONAL").catch(
            () => {
              console.warn("Planning dashboard snapshot unavailable; optional metrics omitted.", {
                classification: "snapshot_unavailable",
              })
              return null
            }
          ),
      hasApplicationFilters
        ? getPlanningSearchResults(filters, authorityCode)
        : Promise.resolve({ results: [] as PlanningApplication[], count: 0 }),
      needsNationalCouncilActivity
        ? getNationalCouncilActivityCached().catch(() => null)
        : Promise.resolve(null),
    ])
  const overview = overviewResult ?? emptyPlanningAggregateSummary()
  const areaStats = needsNationalCouncilActivity
    ? councilActivity?.stats ?? []
    : overview.areaStats

  return {
    authority,
    aggregateAvailable:
      overviewResult !== null &&
      !hasApplicationFilters &&
      !filters.status &&
      !filters.type &&
      !filters.construction,
    totalCount: hasApplicationFilters ? searchResult.count : overview.totalCount,
    latestRegistrationDate:
      hasApplicationFilters && filters.sort !== "oldest"
        ? searchResult.results[0]?.registration_date ?? overview.latestRegistrationDate
        : overview.latestRegistrationDate,
    latestRegistrationMonth: overview.latestRegistrationMonth,
    latestMonthCount: overview.latestMonthCount,
    previousMonthCount: overview.previousMonthCount,
    latestMonthChange: overview.latestMonthChange,
    recentApplications,
    searchResults: searchResult.results,
    searchCount: searchResult.count,
    areaStats,
    councilActivityStats: councilActivity?.stats ?? [],
    councilActivityPeriodStart: councilActivity?.periodStart ?? null,
    councilActivityPeriodEnd: councilActivity?.periodEnd ?? null,
    statusStats: overview.statusStats,
    typeStats: overview.typeStats,
    monthStats: overview.monthStats,
    mapPoints: overview.mapPoints,
    latestMonthAreaStats: overview.latestMonthAreaStats,
    latestMonthStatusStats: overview.latestMonthStatusStats,
    latestMonthTypeStats: overview.latestMonthTypeStats,
    areaOptions: authority
      ? overview.areaOptions
      : PLANNING_AUTHORITIES.map((item) => item.shortName),
    statusOptions: overview.statusOptions.length
      ? overview.statusOptions
      : PLANNING_STATUS_OPTIONS.map((option) => option.label),
    typeOptions: overview.typeOptions.length
      ? overview.typeOptions
      : PLANNING_APPLICATION_TYPE_GROUPS.map((group) => group.label),
    activeArea: areaStats[0] ?? null,
  }
}

export async function getPlanningLocalityDashboard(
  authority: PlanningAuthority,
  localitySlug: string,
  includeOlder = false,
  activeOnly = false
) {
  try {
    const payload = await getPlanningLocalityPageModelCached(
      authority.code,
      localitySlug,
      includeOlder,
      activeOnly
    )
    if (!payload) return null

    const recentApplications = Array.isArray(payload.recentApplications)
      ? payload.recentApplications
      : []
    const dashboard: PlanningDashboard = {
      authority,
      aggregateAvailable: false,
      ...emptyPlanningAggregateSummary(),
      totalCount: Number(payload.totalCount || 0),
      latestRegistrationDate: payload.latestRegistrationDate ?? null,
      recentApplications,
      searchResults: recentApplications,
      searchCount: Number(payload.totalCount || 0),
      councilActivityStats: [],
      councilActivityPeriodStart: null,
      councilActivityPeriodEnd: null,
    }

    return {
      locality: payload.locality,
      dashboard,
      activeCount: Number(payload.activeCount || 0),
      recentDecisions: Array.isArray(payload.recentDecisions)
        ? payload.recentDecisions
        : [],
      notableRows: Array.isArray(payload.notables) ? payload.notables : [],
      degraded: false,
    }
  } catch (error) {
    console.warn("Planning locality page model unavailable; rendering a degraded page.", {
      classification: error instanceof Error ? error.name : "unknown",
    })
    const locality = localitySlug
      .split("-")
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ")
    const dashboard: PlanningDashboard = {
      authority,
      aggregateAvailable: false,
      ...emptyPlanningAggregateSummary(),
      recentApplications: [],
      searchResults: [],
      searchCount: 0,
      councilActivityStats: [],
      councilActivityPeriodStart: null,
      councilActivityPeriodEnd: null,
    }
    return {
      locality,
      dashboard,
      activeCount: 0,
      recentDecisions: [] as PlanningApplication[],
      notableRows: [] as PlanningLocalityPageModelPayload["notables"],
      degraded: true,
    }
  }
}

type PlanningLocalityPageModelPayload = {
  locality: string
  totalCount: number | string
  activeCount: number | string
  latestRegistrationDate: string | null
  recentApplications: PlanningApplication[]
  recentDecisions: PlanningApplication[]
  notables: Array<{
    application: PlanningApplication
    displayName: string | null
    categories: string[]
  }>
}

const getPlanningLocalityPageModelCached = unstable_cache(
  async (
    authorityCode: string,
    localitySlug: string,
    includeOlder: boolean,
    activeOnly: boolean
  ) => {
    const { data, error } = await getOptionalServerSupabase().rpc(
      "openlist_planning_locality_page_model",
      {
        p_authority_code: authorityCode,
        p_locality_slug: localitySlug,
        p_include_older: includeOlder,
        p_active_only: activeOnly,
      }
    )
    if (error) throw new Error("Planning locality page model query failed")
    return data as PlanningLocalityPageModelPayload | null
  },
  ["planning-locality-page-model", "v1"],
  {
    revalidate: PLANNING_CACHE_REVALIDATE_SECONDS,
    tags: [PLANNING_DATASET_CACHE_TAG],
  }
)

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

const getRecentPlanningApplicationsCached = unstable_cache(
  async (authorityCode: string) => {
    let query = getOptionalServerSupabase()
      .from("planning_applications")
      .select(PLANNING_APPLICATION_SELECT)
      .order("registration_date", { ascending: false })
      .order("reference", { ascending: false })
      .limit(8)

    if (authorityCode !== "NATIONAL") {
      query = query.eq("local_authority_code", authorityCode)
    }

    const { data, error } = await query
    if (error) throw new Error("Recent Planning applications unavailable")
    return (data ?? []) as PlanningApplication[]
  },
  ["planning-recent-applications", "v1"],
  {
    revalidate: PLANNING_CACHE_REVALIDATE_SECONDS,
    tags: [PLANNING_DATASET_CACHE_TAG],
  }
)

type PlanningCouncilActivityWindow = {
  periodStart: string | null
  periodEnd: string | null
  stats: PlanningCountStat[]
}

const getNationalCouncilActivityCached = unstable_cache(
  async (): Promise<PlanningCouncilActivityWindow | null> => {
    const { data, error } = await getOptionalServerSupabase().rpc(
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
  {
    revalidate: PLANNING_CACHE_REVALIDATE_SECONDS,
    tags: [PLANNING_DATASET_CACHE_TAG],
  }
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
      .from("planning_canonical_events")
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
  ["planning-application-events", "v2-canonical"],
  { revalidate: PLANNING_DETAIL_CACHE_REVALIDATE }
)

export const getPlanningApplicationEvents = cache(
  async function getPlanningApplicationEvents(applicationId: string) {
    try {
      return await getPlanningApplicationEventsCached(applicationId)
    } catch (error) {
      console.warn(
        `Planning timeline unavailable for ${applicationId}; rendering core application.`,
        error
      )
      return [] as PlanningEvent[]
    }
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

export async function getNotablePlanningSitemapApplications(limit = 50000) {
  const boundedLimit = Math.max(1, Math.min(limit, 50000))
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

const getPlanningAggregateSummaryCached = unstable_cache(
  async (authorityCode: string) => {
    const serverSupabase = getOptionalServerSupabase()
    const { data, error } = await serverSupabase.rpc(
      "openlist_planning_dashboard_snapshot",
      { p_authority_code: authorityCode }
    )

    if (error || !data) {
      throw new Error("Planning dashboard snapshot unavailable")
    }

    return normaliseDatabaseAggregateSummary(data, authorityCode)
  },
  ["planning-aggregate-summary", PLANNING_AGGREGATE_CACHE_VERSION],
  {
    revalidate: PLANNING_CACHE_REVALIDATE_SECONDS,
    tags: [PLANNING_DATASET_CACHE_TAG],
  }
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
    .select(PLANNING_APPLICATION_SELECT)

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
    query = query.eq("normalized_status", normalisePlanningStatus(filters.status))
  }

  if (filters.type) {
    const applicationTypes = planningApplicationTypeValues(filters.type)
    if (applicationTypes.length === 1) {
      query = query.eq("application_type", applicationTypes[0])
    } else if (applicationTypes.length > 1) {
      query = query.in("application_type", applicationTypes)
    }
  }

  if (filters.construction === "commenced") {
    query = query.eq("construction_status", "commenced")
  }

  const ascending = filters.sort === "oldest"
  const { data, error } = await query
    .order("registration_date", { ascending, nullsFirst: false })
    .order("reference", { ascending })
    .limit(26)

  if (error) throw new Error("Planning search query unavailable")

  // Match the interactive API: one sentinel row gives a lower-bound result
  // count without ever requiring COUNT(*) over a broad public search cohort.
  const rows = (data ?? []) as PlanningApplication[]
  const hasMore = rows.length > 25
  const results = hasMore ? rows.slice(0, 25) : rows

  return {
    results,
    count: results.length + (hasMore ? 1 : 0),
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
