import { unstable_cache } from "next/cache"
import { PLANNING_DATASET_CACHE_TAG } from "@/lib/dataset-cache"
import type { PlanningApplication } from "@/lib/planning"
import { getPlanningAuthorityByCode } from "@/lib/planning-authorities"
import { getServerSupabase } from "@/lib/supabase"
import { PLANNING_PUBLIC_CATEGORY_PAGE_SIZE, planningPublicCategoryPageRequest } from "@/lib/planning-public-category-pagination"
import {
  PLANNING_PUBLIC_CATEGORIES,
  type PlanningPublicCategory,
} from "@/lib/planning-public-category-definitions"
export { PLANNING_PUBLIC_CATEGORY_MAX_PAGE, PLANNING_PUBLIC_CATEGORY_PAGE_SIZE, planningPublicCategoryPageNumber, planningPublicCategoryPageRequest } from "@/lib/planning-public-category-pagination"
export {
  PLANNING_PUBLIC_CATEGORIES,
  planningPublicCategorySummariesFromSource,
} from "@/lib/planning-public-category-definitions"
export type {
  PlanningPublicCategory,
  PlanningPublicCategorySourceRow,
} from "@/lib/planning-public-category-definitions"

export type PlanningPublicCategoryApplication = {
  application: PlanningApplication
  displayName: string | null
  categories: string[]
}

type CategoryIndexEntry = {
  applicationId: string
  displayName: string | null
  categories: string[]
  authorityCode: string | null
  registrationDate: string | null
  reference: string
  normalizedStatus: string | null
}

type CategoryIndexPayload = { entries?: CategoryIndexEntry[] }
type Payload = {
  rows: PlanningPublicCategoryApplication[]
  totalCount: number
  overallTotalCount: number
  overallActiveCount: number
  activeCount: number
  authorityCounts: Array<{ code: string; count: number }>
}

const ACTIVE_STATUSES = new Set([
  "pre_validation",
  "registered",
  "under_assessment",
  "further_information_requested",
  "further_information_received",
  "appealed",
])

const loadCategoryIndex = unstable_cache(async (slug: string) => {
  const { data, error } = await getServerSupabase().rpc("openlist_planning_public_category_index", {
    p_category: slug,
  })
  if (error) throw new Error(`Planning public category index lookup failed: ${error.message}`)
  const payload = (data ?? {}) as CategoryIndexPayload
  return Array.isArray(payload.entries) ? payload.entries : []
}, ["planning-public-category-index", "v1-compact-index"], { revalidate: 21600, tags: [PLANNING_DATASET_CACHE_TAG] })

const loadCategoryPage = unstable_cache(async (
  slug: string,
  authorityCode: string | null,
  pageNumber: number,
  pageSize: number,
  activeOnly: boolean
): Promise<Payload> => {
  const entries = await loadCategoryIndex(slug)
  const isActive = (entry: CategoryIndexEntry) => ACTIVE_STATUSES.has(entry.normalizedStatus ?? "")

  const overallTotalCount = entries.length
  const overallActiveCount = entries.filter(isActive).length
  const authorityCorpus = activeOnly ? entries.filter(isActive) : entries
  const authorityCountsMap = new Map<string, number>()
  for (const entry of authorityCorpus) {
    if (!entry.authorityCode) continue
    authorityCountsMap.set(entry.authorityCode, (authorityCountsMap.get(entry.authorityCode) ?? 0) + 1)
  }

  const authorityCounts = [...authorityCountsMap.entries()].map(([code, count]) => ({ code, count }))
  let filtered = authorityCode ? entries.filter((entry) => entry.authorityCode === authorityCode) : entries
  const activeCount = filtered.filter(isActive).length
  if (activeOnly) filtered = filtered.filter(isActive)

  const totalCount = filtered.length
  const offset = Math.max(0, (pageNumber - 1) * pageSize)
  const pageEntries = filtered.slice(offset, offset + pageSize)
  if (!pageEntries.length) {
    return { rows: [], totalCount, overallTotalCount, overallActiveCount, activeCount, authorityCounts }
  }

  const ids = pageEntries.map((entry) => entry.applicationId)
  const { data, error } = await getServerSupabase()
    .from("planning_applications")
    .select("*")
    .in("id", ids)
  if (error) throw new Error(`Planning public category application lookup failed: ${error.message}`)

  const byId = new Map(((data ?? []) as PlanningApplication[]).map((application) => [application.id, application]))
  const rows = pageEntries.flatMap((entry) => {
    const application = byId.get(entry.applicationId)
    return application ? [{ application, displayName: entry.displayName, categories: entry.categories }] : []
  })

  return { rows, totalCount, overallTotalCount, overallActiveCount, activeCount, authorityCounts }
}, ["planning-public-category-page", "v6-shared-compact-index"], { revalidate: 21600, tags: [PLANNING_DATASET_CACHE_TAG] })

export async function getPlanningPublicCategory(slug: string, includeOlder = false, authorityCode?: string | null, requestedPage = 1, activeOnly = false) {
  const category = PLANNING_PUBLIC_CATEGORIES.find((item) => item.slug === slug)
  if (!category) return null
  const selectedAuthority = authorityCode ? getPlanningAuthorityByCode(authorityCode) : null
  const { pageNumber, rpcParameters } = planningPublicCategoryPageRequest(slug, includeOlder, selectedAuthority?.code ?? null, requestedPage)
  const payload = await loadCategoryPage(
    String(rpcParameters.p_category),
    rpcParameters.p_authority_code,
    pageNumber,
    Number(rpcParameters.p_limit),
    activeOnly
  )
  const totalCount = Number(payload.totalCount) || 0
  const overallTotalCount = Number(payload.overallTotalCount) || 0
  const overallActiveCount = Number(payload.overallActiveCount) || 0
  const activeCount = Number(payload.activeCount) || 0
  const totalPages = Math.max(1, Math.ceil(totalCount / PLANNING_PUBLIC_CATEGORY_PAGE_SIZE))
  const authorities = payload.authorityCounts
    .map(({ code, count }) => ({ authority: getPlanningAuthorityByCode(code), count: Number(count) || 0 }))
    .filter((item) => item.authority)
    .sort((left, right) => right.count - left.count || String(left.authority?.shortName || "").localeCompare(String(right.authority?.shortName || "")))

  return {
    category,
    rows: payload.rows,
    totalCount,
    overallTotalCount,
    overallActiveCount,
    activeCount,
    authorities,
    includeOlder,
    activeOnly,
    selectedAuthority,
    pageNumber,
    pageSize: PLANNING_PUBLIC_CATEGORY_PAGE_SIZE,
    totalPages,
  }
}

export async function getPlanningPublicCategorySummaries(_minimumCount = 3) {
  void _minimumCount
  return [] as Array<PlanningPublicCategory & { count: number }>
}
