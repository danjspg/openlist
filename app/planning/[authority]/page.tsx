import type { Metadata } from "next"
import { notFound } from "next/navigation"
import {
  PLANNING_AUTHORITIES,
  getPlanningAuthorityBySlug,
} from "@/lib/planning-authorities"
import {
  PlanningApplicationsView,
} from "@/app/planning/applications/PlanningApplicationsPage"
import type { PlanningSearchParams } from "@/lib/planning"

export const revalidate = 21600

type PlanningAuthorityPageProps = {
  params: Promise<{ authority: string }>
  searchParams?: Promise<PlanningSearchParams>
}

export function generateStaticParams() {
  return PLANNING_AUTHORITIES.map((authority) => ({
    authority: authority.slug,
  }))
}

export async function generateMetadata({
  params,
}: PlanningAuthorityPageProps): Promise<Metadata> {
  const { authority: authoritySlug } = await params
  const authority = getPlanningAuthorityBySlug(authoritySlug)

  if (!authority) {
    return {}
  }

  return {
    title: `${authority.shortName} Planning Applications | OpenList`,
    description: `Search ${authority.historyLabel} of ${authority.name} planning applications by location, reference, development, applicant or status.`,
    alternates: {
      canonical: `/planning/${authority.slug}`,
    },
    robots: {
      index: true,
      follow: true,
    },
  }
}

export default async function PlanningAuthorityPage({
  params,
  searchParams,
}: PlanningAuthorityPageProps) {
  const { authority: authoritySlug } = await params
  const authority = getPlanningAuthorityBySlug(authoritySlug)

  if (!authority) {
    notFound()
  }

  return (
    <PlanningApplicationsView searchParams={searchParams} authority={authority} />
  )
}
