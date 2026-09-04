import type { Metadata } from "next"
import { getPlanningAuthorityBySlug } from "@/lib/planning-authorities"
import { planningReferenceFromSlug } from "@/lib/property-intelligence"

export const revalidate = false
export const dynamicParams = true
export function generateStaticParams() { return [] }

type Props = { params: Promise<{ authority: string; reference: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const resolved = await params
  const authority = getPlanningAuthorityBySlug(resolved.authority)
  const reference = planningReferenceFromSlug(resolved.reference)
  if (!authority || !reference) return {}

  return {
    title: `Planning application ${reference} | ${authority.name} | OpenList`,
    description: `View planning application ${reference} from ${authority.name} on OpenList.`,
    alternates: { canonical: `/planning/${authority.slug}/${resolved.reference}` },
    robots: { index: true, follow: true },
  }
}

export { default } from "./PlanningApplicationPageContent"
