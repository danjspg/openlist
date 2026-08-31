import { getPlanningSearchPage } from "@/lib/planning-search-page"
import {
  getPlanningPublicCategory,
  type PlanningPublicCategoryApplication,
} from "@/lib/planning-public-categories"

export const PLANNING_CATEGORY_PAGE_SIZE = 25

export async function getPlanningPublicCategoryPage(
  slug: string,
  options: { page?: number; includeOlder?: boolean; authorityCode?: string | null } = {}
) {
  const pageNumber = Math.max(1, Math.floor(Number(options.page) || 1))
  const offset = (pageNumber - 1) * PLANNING_CATEGORY_PAGE_SIZE

  if (slug === "padel") {
    const base = await getPlanningPublicCategory(slug, false, options.authorityCode, {
      offset: 0,
      limit: 0,
      metadataOnly: true,
    })
    if (!base) return null

    const search = await getPlanningSearchPage({
      q: "padel",
      authority: base.selectedAuthority?.slug,
      offset,
      limit: PLANNING_CATEGORY_PAGE_SIZE,
    })
    const rows: PlanningPublicCategoryApplication[] = search.results.map((application) => ({
      application,
      displayName: null,
      categories: ["padel"],
    }))
    const totalPages = Math.max(1, Math.ceil(search.count / PLANNING_CATEGORY_PAGE_SIZE))
    return {
      ...base,
      rows,
      totalCount: search.count,
      overallTotalCount: search.count,
      page: pageNumber,
      pageSize: PLANNING_CATEGORY_PAGE_SIZE,
      totalPages,
      hasPreviousPage: pageNumber > 1,
      hasNextPage: pageNumber < totalPages,
      source: "planning-search" as const,
    }
  }

  const result = await getPlanningPublicCategory(slug, options.includeOlder ?? false, options.authorityCode, {
    offset,
    limit: PLANNING_CATEGORY_PAGE_SIZE,
  })
  if (!result) return null
  const totalPages = Math.max(1, Math.ceil(result.totalCount / PLANNING_CATEGORY_PAGE_SIZE))
  return {
    ...result,
    page: pageNumber,
    pageSize: PLANNING_CATEGORY_PAGE_SIZE,
    totalPages,
    hasPreviousPage: pageNumber > 1,
    hasNextPage: pageNumber < totalPages,
    source: "notable-index" as const,
  }
}
