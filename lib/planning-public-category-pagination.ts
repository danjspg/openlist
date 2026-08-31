export const PLANNING_PUBLIC_CATEGORY_PAGE_SIZE = 25
export const PLANNING_PUBLIC_CATEGORY_MAX_PAGE = 1_000

export function planningPublicCategoryPageNumber(requestedPage: number) {
  return Math.max(1, Math.min(Math.trunc(requestedPage) || 1, PLANNING_PUBLIC_CATEGORY_MAX_PAGE))
}

export function planningPublicCategoryPageRequest(
  slug: string,
  includeOlder: boolean,
  authorityCode: string | null,
  requestedPage: number
) {
  const pageNumber = planningPublicCategoryPageNumber(requestedPage)
  return {
    pageNumber,
    rpcParameters: {
      p_category: slug,
      p_include_older: includeOlder,
      p_authority_code: authorityCode,
      p_limit: PLANNING_PUBLIC_CATEGORY_PAGE_SIZE,
      p_offset: (pageNumber - 1) * PLANNING_PUBLIC_CATEGORY_PAGE_SIZE,
    },
  }
}
