import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { getPlanningAuthorityBySlug } from "@/lib/planning-authorities"
import { formatPlanningDate, getPlanningLocalityDashboard } from "@/lib/planning"
import { planningApplicationPath } from "@/lib/property-intelligence"
import { areaSlug } from "@/lib/ppr"
import { countyForPlanningAuthority } from "@/lib/property-intelligence"

export const revalidate = 21600
export const dynamicParams = true
export function generateStaticParams() { return [] }
type Props = { params: Promise<{ authority: string; areaSlug: string }> }

async function resolve(params: Props["params"]) {
  const { authority: authoritySlug, areaSlug: slug } = await params
  const authority = getPlanningAuthorityBySlug(authoritySlug)
  if (!authority || areaSlug(slug) !== slug) return null
  const locality = await getPlanningLocalityDashboard(authority, slug)
  return locality ? { authority, slug, ...locality } : null
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const page = await resolve(params)
  if (!page) return {}
  return {
    title: `${page.locality} Planning Applications | Recent Decisions & Developments`,
    description: `Browse ${page.dashboard.totalCount} recorded planning applications in ${page.locality}, including recent registrations, decisions and development types.`,
    alternates: { canonical: `/planning/${page.authority.slug}/areas/${page.slug}` },
    robots: { index: true, follow: true },
  }
}

export default async function PlanningLocalityPage({ params }: Props) {
  const page = await resolve(params)
  if (!page) notFound()
  const { authority, locality, dashboard } = page
  const county = countyForPlanningAuthority(authority.code)
  return <main className="min-h-screen bg-stone-50"><section className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
    <div className="rounded-[32px] border border-stone-200 bg-white p-6 shadow-sm sm:p-10">
      <p className="text-sm font-medium uppercase tracking-[0.2em] text-stone-500">{authority.shortName}</p>
      <h1 className="mt-2 text-4xl font-semibold tracking-tight text-stone-900">Planning applications in {locality}</h1>
      <p className="mt-4 max-w-3xl text-stone-600">Recorded OpenList history for {locality}, {authority.shortName}: registrations, decisions and development activity from published planning records.</p>
      <div className="mt-6 flex flex-wrap gap-4 text-sm font-medium text-stone-700"><Link href={`/planning/${authority.slug}?area=${encodeURIComponent(locality)}`}>Search all {locality} applications →</Link><Link href={`/planning/${authority.slug}`}>View {authority.shortName} planning</Link>{county ? <Link href={`/sold-prices/${areaSlug(county)}/${areaSlug(locality)}`}>Sold prices in {locality} →</Link> : null}</div>
    </div>
    <div className="mt-6 grid gap-4 sm:grid-cols-3"><Stat label="Recorded applications" value={String(dashboard.totalCount)} /><Stat label="Latest registration" value={formatPlanningDate(dashboard.latestRegistrationDate)} /><Stat label="Current registration month" value={String(dashboard.latestMonthCount)} /></div>
    <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_320px]"><section className="rounded-[28px] border border-stone-200 bg-white p-6 shadow-sm"><h2 className="text-2xl font-semibold text-stone-900">Latest applications</h2><div className="mt-4 divide-y divide-stone-200">{dashboard.searchResults.slice(0, 12).map((application) => <article key={application.id} className="py-4"><Link className="font-semibold text-stone-900 hover:underline" href={planningApplicationPath(authority, application.reference)}>{application.proposal || `Planning application ${application.reference}`}</Link><p className="mt-1 text-sm text-stone-600">{application.location || locality} · {formatPlanningDate(application.registration_date)} · {application.status || "Status not recorded"}</p></article>)}</div></section>
    <aside className="space-y-6"><Facts title="Status mix" stats={dashboard.statusStats} /><Facts title="Common application types" stats={dashboard.typeStats} /><p className="rounded-[24px] border border-stone-200 bg-white p-5 text-sm leading-6 text-stone-600">Coverage reflects the available published records for {authority.name}; dates and statuses are supplied by the relevant planning authority.</p></aside></div>
  </section></main>
}
function Stat({ label, value }: { label: string; value: string }) { return <div className="rounded-[24px] border border-stone-200 bg-white p-5 shadow-sm"><p className="text-sm text-stone-500">{label}</p><p className="mt-2 text-xl font-semibold text-stone-900">{value}</p></div> }
function Facts({ title, stats }: { title: string; stats: Array<{ label: string; count: number }> }) { return <section className="rounded-[24px] border border-stone-200 bg-white p-5 shadow-sm"><h2 className="font-semibold text-stone-900">{title}</h2><ul className="mt-3 space-y-2 text-sm text-stone-600">{stats.slice(0, 6).map((stat) => <li key={stat.label} className="flex justify-between gap-3"><span>{stat.label}</span><span>{stat.count}</span></li>)}</ul></section> }
