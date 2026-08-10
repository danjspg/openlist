import type { Metadata } from "next"
import { notFound } from "next/navigation"
import {
  getPlanningAuthorityBySlug,
} from "@/lib/planning-authorities"
import {
  PlanningApplicationsView,
} from "@/app/planning/applications/PlanningApplicationsPage"

export const revalidate = 21600
export const dynamicParams = true

type PlanningAuthorityPageProps = {
  params: Promise<{ authority: string }>
}

export function generateStaticParams() {
  return []
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
}: PlanningAuthorityPageProps) {
  const { authority: authoritySlug } = await params
  const authority = getPlanningAuthorityBySlug(authoritySlug)

  if (!authority) {
    notFound()
  }

  return <PlanningApplicationsView authority={authority} />
}
