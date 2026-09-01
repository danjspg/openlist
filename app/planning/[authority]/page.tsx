import type { Metadata } from "next"
import Link from "@/components/RuntimeDataLink"
import { notFound } from "next/navigation"
import {
  getPlanningAuthorityBySlug,
} from "@/lib/planning-authorities"
import {
  PlanningApplicationsView,
} from "@/app/planning/applications/PlanningApplicationsPage"
import { getPlanningLocalityDirectory } from "@/lib/locality-seo"

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
    description: `Search available recorded history of ${authority.name} planning applications by location, reference, development, applicant or status.`,
    alternates: {
      canonical: `/planning/${authority.slug}`,
    },
    robots: {
      index: true,
      follow: true,
    },
  }
}

function localityLabel(path: string) {
  const slug = path.split("/").at(-1) || ""
  return slug
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ")
}

export default async function PlanningAuthorityPage({
  params,
}: PlanningAuthorityPageProps) {
  const { authority: authoritySlug } = await params
  const authority = getPlanningAuthorityBySlug(authoritySlug)

  if (!authority) {
    notFound()
  }

  const localities = (await getPlanningLocalityDirectory().catch(() => []))
    .filter((row) => row.authority_code === authority.code)
    .sort((left, right) => right.activeCount - left.activeCount)
    .slice(0, 6)

  return <>
    {localities.length ? <nav className="mx-auto max-w-6xl px-4 pt-6 text-sm text-stone-600 sm:px-6" aria-label="Featured planning localities">
      <span className="mr-3 font-medium text-stone-800">Explore planning by area:</span>
      {localities.map((row) => <Link key={row.canonical_path} className="mr-3 inline-block hover:text-stone-950 hover:underline" href={row.canonical_path}>{localityLabel(row.canonical_path)}</Link>)}
      <Link className="inline-block font-semibold text-emerald-800 hover:underline" href={`/planning/${authority.slug}/areas`}>Browse all areas →</Link>
    </nav> : null}
    <PlanningApplicationsView authority={authority} />
  </>
}
