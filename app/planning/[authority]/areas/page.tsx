import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { getPlanningLocalityDirectory } from "@/lib/locality-seo"
import { getPlanningAuthorityBySlug } from "@/lib/planning-authorities"

export const revalidate = 21600
export const dynamicParams = true

export function generateStaticParams() {
  return []
}

type Props = { params: Promise<{ authority: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { authority: authoritySlug } = await params
  const authority = getPlanningAuthorityBySlug(authoritySlug)
  if (!authority) return {}
  return {
    title: `Planning Areas in ${authority.shortName} | OpenList`,
    description: `Browse planning application pages by area within ${authority.name}, including recent activity, decisions and notable developments.`,
    alternates: { canonical: `/planning/${authority.slug}/areas` },
    robots: { index: true, follow: true },
  }
}

export default async function PlanningAuthorityAreasPage({ params }: Props) {
  const { authority: authoritySlug } = await params
  const authority = getPlanningAuthorityBySlug(authoritySlug)
  if (!authority) notFound()

  const nf = new Intl.NumberFormat("en-IE")
  const areas = (await getPlanningLocalityDirectory())
    .filter((area) => area.authority_code === authority.code)
    .sort((a, b) => b.activeCount - a.activeCount || a.locality_label.localeCompare(b.locality_label, "en-IE", { sensitivity: "base" }))

  return (
    <main className="min-h-screen bg-stone-50 text-stone-900">
      <section className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-12">
        <nav className="text-sm text-stone-500" aria-label="Breadcrumb">
          <Link className="hover:text-stone-950 hover:underline" href="/planning">Planning</Link>
          <span className="mx-2" aria-hidden="true">/</span>
          <Link className="hover:text-stone-950 hover:underline" href={`/planning/${authority.slug}`}>{authority.shortName}</Link>
          <span className="mx-2" aria-hidden="true">/</span>
          <span>Areas</span>
        </nav>

        <header className="mt-6 max-w-3xl">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-500">{authority.name}</p>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight text-stone-950">Planning areas in {authority.shortName}</h1>
          <p className="mt-4 text-base leading-7 text-stone-600">Browse {nf.format(areas.length)} locality pages, ordered by current planning activity.</p>
        </header>

        {areas.length ? (
          <ul className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {areas.map((area) => (
              <li key={area.canonical_path}>
                <Link className="group flex h-full items-center justify-between gap-4 rounded-2xl border border-stone-200 bg-white p-4 shadow-sm hover:border-emerald-200" href={area.canonical_path}>
                  <span className="min-w-0">
                    <span className="block font-semibold text-stone-900 group-hover:text-emerald-800 group-hover:underline">{area.locality_label}</span>
                    <span className="mt-1 block text-xs text-stone-500">{nf.format(area.evidence.applicationCount || 0)} recorded applications</span>
                  </span>
                  <span className="shrink-0 text-xs font-medium text-emerald-800">{nf.format(area.activeCount)} active</span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-8 rounded-2xl border border-stone-200 bg-white p-5 text-stone-600">No locality pages are currently available for this authority.</p>
        )}
      </section>
    </main>
  )
}
