import type { Metadata } from "next"
import Link from "@/components/RuntimeDataLink"
import { notFound, redirect } from "next/navigation"
import { PlanningApplicationList } from "@/components/planning/PlanningApplicationResult"
import {
  formatPlanningDate,
  getPlanningLocalityDashboard,
  type PlanningApplication,
  type PlanningDashboard,
} from "@/lib/planning"
import { getPlanningAuthorityByCode } from "@/lib/planning-authorities"
import { getPlanningCanonicalPlace } from "@/lib/planning-canonical-place"
import { planningResultRecord } from "@/lib/planning-result-presentation"

export const revalidate = 21600
export const dynamicParams = true

export function generateStaticParams() {
  return []
}

type Props = { params: Promise<{ placeSlug: string }> }

type MemberDashboard = {
  authority: NonNullable<ReturnType<typeof getPlanningAuthorityByCode>>
  locality: string
  localitySlug: string
  dashboard: PlanningDashboard
}

async function resolvePlace(placeSlug: string) {
  const place = await getPlanningCanonicalPlace(placeSlug)
  if (!place) return null

  const members = place.memberships.flatMap((membership) => {
    const authority = getPlanningAuthorityByCode(membership.authority_code)
    return authority ? [{ membership, authority }] : []
  })

  return { place, members }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { placeSlug } = await params
  const resolved = await resolvePlace(placeSlug)
  if (!resolved) return {}

  const { place, members } = resolved
  if (!place.aggregate_enabled || members.length < 2) {
    const member = members[0]
    return member
      ? { alternates: { canonical: `/planning/${member.authority.slug}/areas/${member.membership.locality_slug}` } }
      : {}
  }

  const authorityNames = members.map(({ authority }) => authority.shortName).join(" & ")
  return {
    title: `${place.display_name} Planning Applications | ${authorityNames}`,
    description: `Planning applications in ${place.display_name} across ${members.length} planning authorities, with recent activity and links to each council-specific area view.`,
    alternates: { canonical: `/planning/areas/${place.slug}` },
    robots: { index: true, follow: true },
  }
}

export default async function PlanningCanonicalPlacePage({ params }: Props) {
  const { placeSlug } = await params
  const resolved = await resolvePlace(placeSlug)
  if (!resolved) notFound()

  const { place, members } = resolved
  if (!members.length) notFound()

  if (!place.aggregate_enabled || members.length < 2) {
    const member = members[0]
    redirect(`/planning/${member.authority.slug}/areas/${member.membership.locality_slug}`)
  }

  const loaded: Array<MemberDashboard | null> = []
  for (const { membership, authority } of members) {
    const localityPage = await getPlanningLocalityDashboard(authority, membership.locality_slug)
    loaded.push(localityPage
      ? ({
          authority,
          locality: localityPage.locality,
          localitySlug: membership.locality_slug,
          dashboard: localityPage.dashboard,
        } satisfies MemberDashboard)
      : null)
  }
  const dashboards = loaded.filter((value): value is MemberDashboard => value !== null)
  if (dashboards.length < 2) notFound()

  const totalCount = dashboards.reduce((sum, member) => sum + member.dashboard.totalCount, 0)
  const latestRegistrationDate = dashboards
    .map((member) => member.dashboard.latestRegistrationDate)
    .filter((value): value is string => Boolean(value))
    .sort((a, b) => b.localeCompare(a))[0] ?? null

  const latestApplications = dashboards
    .flatMap((member) => member.dashboard.searchResults)
    .sort((a: PlanningApplication, b: PlanningApplication) =>
      String(b.registration_date || "").localeCompare(String(a.registration_date || "")) ||
      b.reference.localeCompare(a.reference)
    )
    .slice(0, 8)
    .map(planningResultRecord)

  const nf = new Intl.NumberFormat("en-IE")

  return (
    <main className="min-h-screen bg-stone-50 text-stone-900">
      <section className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
        <nav className="text-sm text-stone-500" aria-label="Breadcrumb">
          <Link className="hover:text-stone-950 hover:underline" href="/planning">Planning</Link>
          <span className="mx-2" aria-hidden="true">/</span>
          <Link className="hover:text-stone-950 hover:underline" href="/planning/areas">Areas</Link>
          <span className="mx-2" aria-hidden="true">/</span>
          <span>{place.display_name}</span>
        </nav>

        <header className="mt-6 border-b border-stone-200 pb-7 sm:pb-8">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-500">Cross-authority planning area</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-stone-950 sm:text-4xl">
            Planning applications in {place.display_name}
          </h1>
          <p className="mt-3 max-w-3xl text-base leading-7 text-stone-600">
            {place.display_name} spans planning-authority boundaries in OpenList, so this page brings the council-specific records together while preserving each authority view below.
          </p>
          <div className="mt-5 flex flex-wrap gap-x-6 gap-y-2 text-sm text-stone-500">
            <span><strong className="font-semibold text-stone-900">{nf.format(totalCount)}</strong> recorded applications</span>
            <span><strong className="font-semibold text-stone-900">{dashboards.length}</strong> planning authorities</span>
            <span>Latest registration: <strong className="font-semibold text-stone-900">{formatPlanningDate(latestRegistrationDate)}</strong></span>
          </div>
        </header>

        <section className="mt-8" aria-labelledby="authority-views">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-500">Council-specific records</p>
          <h2 id="authority-views" className="mt-1 text-2xl font-semibold tracking-tight text-stone-950">Planning authorities covering {place.display_name}</h2>
          <div className="mt-5 grid gap-4 md:grid-cols-2">
            {dashboards.map((member) => (
              <Link
                key={member.authority.code}
                href={`/planning/${member.authority.slug}/areas/${member.localitySlug}`}
                className="group rounded-2xl border border-stone-200 bg-white p-5 shadow-sm transition hover:border-emerald-200 hover:shadow-md"
              >
                <p className="text-sm font-semibold text-stone-950 group-hover:text-emerald-800 group-hover:underline">{member.authority.name}</p>
                <p className="mt-2 text-2xl font-semibold tracking-tight text-stone-950">{nf.format(member.dashboard.totalCount)}</p>
                <p className="mt-1 text-sm text-stone-500">recorded {member.locality} applications</p>
                <p className="mt-4 text-sm font-semibold text-stone-700">Open council-specific area →</p>
              </Link>
            ))}
          </div>
        </section>

        {latestApplications.length ? (
          <section className="mt-10" aria-labelledby="latest-place-applications">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-500">Recent activity</p>
            <h2 id="latest-place-applications" className="mt-1 text-2xl font-semibold tracking-tight text-stone-950">Latest applications across {place.display_name}</h2>
            <p className="mt-2 text-sm leading-6 text-stone-600">Recent applications from all planning authorities represented by this geographic area.</p>
            <div className="mt-4 border-y border-stone-200">
              <PlanningApplicationList applications={latestApplications} />
            </div>
          </section>
        ) : null}

        <section className="mt-10 border-t border-stone-200 pt-6 text-sm leading-6 text-stone-500">
          <p>
            Aggregate geographic pages are created only for canonical places known to span more than one planning authority. Council-specific pages remain available for authoritative local drill-down.
          </p>
        </section>
      </section>
    </main>
  )
}
