import { unstable_cache } from "next/cache"
import { PLANNING_DATASET_CACHE_TAG } from "@/lib/dataset-cache"
import type { PlanningApplication } from "@/lib/planning"
import { getPlanningAuthorityByCode } from "@/lib/planning-authorities"
import { getServerSupabase } from "@/lib/supabase"
import {
  PLANNING_PUBLIC_CATEGORY_PAGE_SIZE,
  planningPublicCategoryPageRequest,
} from "@/lib/planning-public-category-pagination"

export {
  PLANNING_PUBLIC_CATEGORY_MAX_PAGE,
  PLANNING_PUBLIC_CATEGORY_PAGE_SIZE,
  planningPublicCategoryPageNumber,
  planningPublicCategoryPageRequest,
} from "@/lib/planning-public-category-pagination"

export type PlanningPublicCategory = {
  slug: string
  label: string
  shortLabel: string
  description: string
}

export const PLANNING_PUBLIC_CATEGORIES: PlanningPublicCategory[] = [
  { slug: "padel", label: "Padel planning applications", shortLabel: "Padel", description: "Padel clubs, courts and related leisure developments in Irish planning applications." },
  { slug: "residential-development", label: "Residential development", shortLabel: "Residential development", description: "Housing, apartment and residential schemes of 10 to 49 homes identified from Irish planning applications." },
  { slug: "large-residential", label: "Large residential development", shortLabel: "Large residential development", description: "Housing, apartment and residential schemes of 50 or more homes identified from Irish planning applications." },
  { slug: "wind-farms", label: "Wind farm planning applications", shortLabel: "Wind farms", description: "Wind farms, turbines and related wind-energy planning applications across Ireland." },
  { slug: "solar-energy", label: "Solar energy planning applications", shortLabel: "Solar energy", description: "Solar farms, photovoltaic arrays and related solar-energy planning applications." },
  { slug: "battery-storage", label: "Battery storage planning applications", shortLabel: "Battery storage", description: "Battery energy storage systems and grid-scale battery developments." },
  { slug: "retail", label: "Retail planning applications", shortLabel: "Retail", description: "Significant supermarkets, stores, retail parks and recognisable retail developments." },
  { slug: "hotels-restaurants", label: "Hotels, restaurants and hospitality", shortLabel: "Hotels & restaurants", description: "Hotels, restaurants, drive-throughs and other significant hospitality developments." },
  { slug: "student-accommodation", label: "Student accommodation planning", shortLabel: "Student accommodation", description: "Purpose-built and large student accommodation planning applications." },
  { slug: "data-centres", label: "Data centre planning applications", shortLabel: "Data centres", description: "Data centres, campuses and related infrastructure planning applications." },
  { slug: "infrastructure", label: "Infrastructure planning applications", shortLabel: "Infrastructure", description: "Significant utility, grid, telecommunications and other infrastructure developments." },
  { slug: "transport", label: "Transport planning applications", shortLabel: "Transport", description: "Rail, airport, port and major road infrastructure planning applications." },
  { slug: "industrial-logistics", label: "Industrial and logistics developments", shortLabel: "Industrial & logistics", description: "Factories, logistics hubs, warehouses and significant industrial developments." },
  { slug: "waste-recycling", label: "Waste and recycling developments", shortLabel: "Waste & recycling", description: "Waste treatment, recycling, recovery and disposal facility planning applications." },
  { slug: "quarrying", label: "Quarrying and extraction planning", shortLabel: "Quarrying", description: "Quarry, mining and mineral-extraction planning applications." },
]

export type PlanningPublicCategorySourceRow = {
  application_id: string
  proposal: string | null
  local_authority_code: string
  registration_date: string | null
  display_name: string | null
  notable_categories: string[] | null
}

export type PlanningPublicCategoryApplication = {
  application: PlanningApplication
  displayName: string | null
  categories: string[]
}

type PlanningPublicCategoryPagePayload = {
  rows?: PlanningPublicCategoryApplication[]
  totalCount?: number
  overallTotalCount?: number
  activeCount?: number
  authorityCounts?: Array<{ code: string; count: number }>
}

const loadCategoryPage = unstable_cache(async (
  slug: string,
  includeOlder: boolean,
  authorityCode: string | null,
  pageNumber: number,
  pageSize: number
) => {
  const { data, error } = await getServerSupabase().rpc("openlist_planning_public_category_page", {
    p_category: slug,
    p_include_older: includeOlder,
    p_authority_code: authorityCode,
    p_limit: pageSize,
    p_offset: (pageNumber - 1) * pageSize,
  })
  if (error) throw new Error(`Planning public category page lookup failed: ${error.message}`)
  return (data ?? {}) as PlanningPublicCategoryPagePayload
}, ["planning-public-category-page", "v2-full-exact-membership"], {
  revalidate: 60 * 60 * 6,
  tags: [PLANNING_DATASET_CACHE_TAG],
})

export async function getPlanningPublicCategory(
  slug: string,
  includeOlder = false,
  authorityCode?: string | null,
  requestedPage = 1
) {
  const category = PLANNING_PUBLIC_CATEGORIES.find((item) => item.slug === slug)
  if (!category) return null
  const selectedAuthority = authorityCode ? getPlanningAuthorityByCode(authorityCode) : null
  const { pageNumber, rpcParameters } = planningPublicCategoryPageRequest(
    slug,
    includeOlder,
    selectedAuthority?.code ?? null,
    requestedPage
  )
  const payload = await loadCategoryPage(
    String(rpcParameters.p_category),
    Boolean(rpcParameters.p_include_older),
    rpcParameters.p_authority_code,
    pageNumber,
    Number(rpcParameters.p_limit)
  )
  const totalCount = Number(payload.totalCount) || 0
  const overallTotalCount = Number(payload.overallTotalCount) || 0
  const activeCount = Number(payload.activeCount) || 0
  const totalPages = Math.max(1, Math.ceil(totalCount / PLANNING_PUBLIC_CATEGORY_PAGE_SIZE))
  const authorities = (Array.isArray(payload.authorityCounts) ? payload.authorityCounts : [])
    .map(({ code, count }) => ({ authority: getPlanningAuthorityByCode(code), count: Number(count) || 0 }))
    .filter((item) => item.authority)
    .sort((a, b) => b.count - a.count || String(a.authority?.shortName || "").localeCompare(String(b.authority?.shortName || "")))

  return {
    category,
    rows: Array.isArray(payload.rows) ? payload.rows : [],
    totalCount,
    overallTotalCount,
    activeCount,
    authorities,
    includeOlder,
    selectedAuthority,
    pageNumber,
    pageSize: PLANNING_PUBLIC_CATEGORY_PAGE_SIZE,
    totalPages,
  }
}

// The category directory and homepage are entry surfaces. They should never make
// a cold request wait for, or scan, the notable-category corpus. Their counts are
// supplied by the precomputed sitemap snapshot rather than live fan-out here.
export async function getPlanningPublicCategorySummaries(_minimumCount = 3) {
  void _minimumCount
  return [] as Array<PlanningPublicCategory & { count: number }>
}

export function planningPublicCategorySummariesFromSource(
  sourceRows: PlanningPublicCategorySourceRow[],
  minimumCount = 3
) {
  return PLANNING_PUBLIC_CATEGORIES.map((category) => ({
    ...category,
    count: sourceRows.filter((row) =>
      Array.isArray(row.notable_categories) && row.notable_categories.includes(category.slug)
    ).length,
  })).filter((category) => category.count >= minimumCount)
}
