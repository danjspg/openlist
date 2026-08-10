import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { PlanningApplicationsView } from "@/app/planning/applications/PlanningApplicationsPage"
import { getPlanningAuthorityBySlug } from "@/lib/planning-authorities"
import type { PlanningSearchParams } from "@/lib/planning"

export const dynamic = "force-dynamic"

type FilteredPlanningParams = PlanningSearchParams & {
  _authority?: string
}

export async function generateMetadata({
  searchParams,
}: {
  searchParams?: Promise<FilteredPlanningParams>
}): Promise<Metadata> {
  const resolved = await (
    searchParams || Promise.resolve({} as FilteredPlanningParams)
  )
  const authority = resolved._authority
    ? getPlanningAuthorityBySlug(resolved._authority)
    : null

  return {
    title: authority
      ? `${authority.shortName} Planning Search | OpenList`
      : "Planning Search | OpenList",
    alternates: {
      canonical: authority ? `/planning/${authority.slug}` : "/planning",
    },
    robots: {
      index: false,
      follow: true,
    },
  }
}

export default async function FilteredPlanningPage({
  searchParams,
}: {
  searchParams?: Promise<FilteredPlanningParams>
}) {
  const resolved = await (
    searchParams || Promise.resolve({} as FilteredPlanningParams)
  )
  const authority = resolved._authority
    ? getPlanningAuthorityBySlug(resolved._authority)
    : null

  if (resolved._authority && !authority) notFound()

  return (
    <PlanningApplicationsView
      searchParams={Promise.resolve(resolved)}
      authority={authority ?? undefined}
    />
  )
}
