import { redirect } from "next/navigation"
import { PlanningApplicationsView, metadata, revalidate } from "@/app/planning/applications/PlanningApplicationsPage"
import { getPlanningLocalityDirectory } from "@/lib/locality-seo"
import type { PlanningSearchParams } from "@/lib/planning"

export { metadata, revalidate }

type Props = { searchParams: Promise<PlanningSearchParams> }

export default async function PlanningPage({ searchParams }: Props) {
  const resolvedSearchParams = await searchParams
  const directAreaPath = await resolveDirectPlanningAreaPath(resolvedSearchParams)
  if (directAreaPath) redirect(directAreaPath)

  return (
    <PlanningApplicationsView
      searchParams={Promise.resolve(resolvedSearchParams)}
      showNationalLanding
    />
  )
}

async function resolveDirectPlanningAreaPath(params: PlanningSearchParams) {
  const area = params.area?.trim()
  const query = params.q?.trim()
  const candidate = area || query
  if (!candidate) return null

  const hasOtherFilters = Boolean(
    params.council ||
      params.status ||
      params.type ||
      params.construction ||
      params.sort ||
      (area && query)
  )
  if (hasOtherFilters) return null

  const areaKey = normaliseAreaLabel(candidate)
  const exactMatches = (await getPlanningLocalityDirectory())
    .filter(
      (entry) =>
        normaliseAreaLabel(entry.locality_label) === areaKey ||
        normaliseAreaLabel(entry.locality_slug) === areaKey
    )
    .sort((a, b) => b.activeCount - a.activeCount)

  if (exactMatches.length === 1) return exactMatches[0].canonical_path
  if (exactMatches.length < 2) return null

  const [first, second] = exactMatches
  const clearlyDominant = first.activeCount >= Math.max(25, second.activeCount * 3)
  return clearlyDominant ? first.canonical_path : null
}

function normaliseAreaLabel(value: string) {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ")
}
