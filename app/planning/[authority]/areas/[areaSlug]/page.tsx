import type { Metadata } from "next"
import Link from "@/components/RuntimeDataLink"
import { notFound } from "next/navigation"
import { cache, type ReactNode } from "react"
import { PlanningApplicationList } from "@/components/planning/PlanningApplicationResult"
import {
  formatPlanningDate,
  getPlanningLocalityDashboard,
  type PlanningCountStat,
} from "@/lib/planning"
import { getPlanningAuthorityBySlug } from "@/lib/planning-authorities"
import { groupPlanningLocalityNotables } from "@/lib/planning-locality-notable"
import {
  formatPlanningCount,
  latestRegistrationMonthLabel,
  localityStatusStats,
} from "@/lib/planning-locality-presentation"
import { planningResultRecord } from "@/lib/planning-result-presentation"
import {
  planningSemanticState,
  planningStateBadgeClasses,
} from "@/lib/planning-state-presentation"
import { isActivePlanningStatus } from "@/lib/planning-status"
import { areaSlug } from "@/lib/ppr"
import {
  countyForPlanningAuthority,
  planningApplicationPath,
} from "@/lib/property-intelligence"

export const revalidate = 21600
export const dynamicParams = true
export function generateStaticParams() {
  return []
}

type Props = {
  params: Promise<{ authority: string; areaSlug: string }>
  searchParams: Promise<{ includeOlder?: string; activeOnly?: string; construction?: string }>
}

const resolveLocalityPage = cache(async (
  authoritySlug: string,
  slug: string,
  includeOlder = false,
  activeOnly = false
) => {
  const authority = getPlanningAuthorityBySlug(authoritySlug)
  if (!authority || areaSlug(slug) !== slug) return null

  const localityPage = await getPlanningLocalityDashboard(
    authority,
    slug,
    includeOlder,
    activeOnly
  )
  if (!localityPage) return null

  const county = countyForPlanningAuthority(authority.code)
  return { authority, slug, county, ...localityPage }
})

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { authority: authoritySlug, areaSlug: slug } = await params
  const authority = getPlanningAuthorityBySlug(authoritySlug)
  if (!authority || areaSlug(slug) !== slug) return {}
  const locality = slug
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ")

  return {
    title: `${locality} Planning Applications | ${authority.shortName}`,
    description: `Planning applications in ${locality} from ${authority.name}, with recent registrations, decisions and status information.`,
    alternates: { canonical: `/planning/${authority.slug}/areas/${slug}` },
    robots: { index: true, follow: true },
  }
}

export default async function PlanningLocalityPage({ params, searchParams }: Props) {
  const [{ authority: authoritySlug, areaSlug: slug }, resolvedSearchParams] = await Promise.all([
    params,
    searchParams,
  ])
  const includeOlder = resolvedSearchParams.includeOlder === "1"
  const activeOnly = resolvedSearchParams.activeOnly === "1"
  const page = await resolveLocalityPage(authoritySlug, slug, includeOlder, activeOnly)
  if (!page) notFound()

  const {
    authority,
    locality,
    dashboard,
    activeCount,
    recentDecisions,
    notableRows,
    degraded,
    county,
  } = page
  const notableGroups = groupPlanningLocalityNotables(
    notableRows,
    includeOlder ? 8 : 6,
    includeOlder ? 6 : 3,
    activeOnly
  )
  const searchHref = localitySearchHref(authority.slug, locality)
  const constructionSearchHref = localitySearchHref(authority.slug, locality, undefined, "commenced")
  const decisionsHref = localitySearchHref(authority.slug, locality, "decision_made")
  const statusStats = localityStatusStats(dashboard.statusStats)
  const typeStats = dashboard.typeStats.slice(0, 6)
  const latestApplications = dashboard.searchResults.slice(0, 6).map(planningResultRecord)
  const decisionResults = recentDecisions.map(planningResultRecord)

  return (
    <main className="min-h-screen bg-stone-50">
      <section className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
        <header className="border-b border-stone-200 pb-7 sm:pb-8">
          <p className="text-sm font-medium uppercase tracking-[0.18em] text-stone-500">
            Planning in {authority.shortName}
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-stone-950 sm:text-4xl">
            Planning applications in {locality}
          </h1>
          <p className="mt-3 text-base text-stone-600">
            <span className="font-semibold text-stone-900">{formatPlanningCount(activeCount)} active applications</span>
            {" · "}{formatPlanningCount(dashboard.totalCount)} recorded from {authority.name}
          </p>
          <p className="mt-1 text-sm text-stone-500">
            Latest registration: {formatPlanningDate(dashboard.latestRegistrationDate)}
          </p>
          <nav className="mt-5 flex flex-wrap gap-x-5 gap-y-3 text-sm font-semibold text-stone-700" aria-label={`${locality} planning links`}>
            <Link className="inline-flex min-h-10 items-center hover:text-stone-950 hover:underline" href={searchHref}>
              Search {locality} planning <span aria-hidden="true" className="ml-1">→</span>
            </Link>
            <Link className="inline-flex min-h-10 items-center hover:text-stone-950 hover:underline" href={constructionSearchHref}>
              Construction commenced in {locality} <span aria-hidden="true" className="ml-1">→</span>
            </Link>
            <Link className="inline-flex min-h-10 items-center hover:text-stone-950 hover:underline" href={`/planning/${authority.slug}`}>
              {authority.shortName} planning
            </Link>
            <Link className="inline-flex min-h-10 items-center hover:text-stone-950 hover:underline" href={`/planning/${authority.slug}/areas`}>
              More {authority.shortName} areas
            </Link>
            {county ? (
              <Link className="inline-flex min-h-10 items-center hover:text-stone-950 hover:underline" href={`/sold-prices/${areaSlug(county)}/${areaSlug(locality)}`}>
                Sold prices in {locality} <span aria-hidden="true" className="ml-1">→</span>
              </Link>
            ) : null}
          </nav>
          {degraded ? (
            <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-950">
              Some live Planning details are temporarily unavailable. Core navigation remains available and optional sections have been omitted.
            </p>
          ) : null}
        </header>

        {notableGroups.length > 0 ? (
          <section className="mt-6 rounded-2xl border border-emerald-200 bg-emerald-50/70 p-5 shadow-sm sm:p-6" aria-labelledby="notable-local-development">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-800">
              Significant local development
            </p>
            <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h2 id="notable-local-development" className="text-2xl font-semibold tracking-tight text-stone-950 sm:text-3xl">
                  Notable planning activity in {locality}
                </h2>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-stone-600">
                  Major residential, energy, retail, infrastructure and other locally significant applications identified from the planning record.
                </p>
              </div>
              <Link className="inline-flex min-h-10 shrink-0 items-center text-sm font-semibold text-emerald-900 hover:underline" href={searchHref}>
                Search all {locality} planning <span aria-hidden="true" className="ml-1">→</span>
              </Link>
            </div>
            <div className="mt-4 flex flex-wrap gap-3">
              <Link
                href={localityNotableHref(authority.slug, page.slug, { includeOlder: !includeOlder, activeOnly })}
                role="switch"
                aria-checked={includeOlder}
                className="inline-flex min-h-10 items-center gap-3 rounded-full border border-emerald-200 bg-white px-4 text-sm font-semibold text-stone-800"
              >
                <span aria-hidden="true" className={`h-5 w-9 rounded-full p-0.5 ${includeOlder ? "bg-emerald-700" : "bg-stone-300"}`}><span className={`block h-4 w-4 rounded-full bg-white transition ${includeOlder ? "translate-x-4" : ""}`} /></span>
                Include older applications
              </Link>
              <Link
                href={localityNotableHref(authority.slug, page.slug, { includeOlder, activeOnly: !activeOnly })}
                role="switch"
                aria-checked={activeOnly}
                className="inline-flex min-h-10 items-center gap-3 rounded-full border border-emerald-200 bg-white px-4 text-sm font-semibold text-stone-800"
              >
                <span aria-hidden="true" className={`h-5 w-9 rounded-full p-0.5 ${activeOnly ? "bg-emerald-700" : "bg-stone-300"}`}><span className={`block h-4 w-4 rounded-full bg-white transition ${activeOnly ? "translate-x-4" : ""}`} /></span>
                Active only
              </Link>
            </div>

            <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {notableGroups.map((group) => (
                <article key={group.key} className="rounded-xl border border-emerald-100 bg-white p-4">
                  <div className="flex items-baseline justify-between gap-3">
                    <h3 className="text-base font-semibold text-stone-950">{group.label}</h3>
                    <span className="text-xs font-medium text-stone-500">
                      {formatPlanningCount(group.applications.length)} shown
                    </span>
                  </div>
                  <ul className="mt-3 divide-y divide-stone-100">
                    {group.applications.map((item) => {
                      const application = item.application
                      const active = isActivePlanningStatus(application.normalized_status)
                      const state = planningSemanticState({
                        normalizedStatus: application.normalized_status,
                        statusLabel: application.status,
                        decision: application.decision_text,
                      })
                      return (
                        <li key={application.id} className="py-3 first:pt-0 last:pb-0">
                          <Link className="group block" href={planningApplicationPath(authority, application.reference)}>
                            <p className="line-clamp-2 text-sm font-semibold leading-5 text-stone-900 group-hover:text-emerald-800 group-hover:underline">
                              {item.displayName || application.proposal || application.location || application.reference}
                            </p>
                            {item.displayName && application.proposal ? (
                              <p className="mt-1 line-clamp-2 text-xs leading-5 text-stone-500">{application.proposal}</p>
                            ) : null}
                            <div className="mt-2 flex flex-wrap gap-1.5">
                              {active ? (
                                <span className="inline-flex rounded-full border border-stone-300 bg-stone-100 px-2 py-0.5 text-[11px] font-semibold text-stone-700">Active</span>
                              ) : null}
                              {state ? (
                                <span className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold ${planningStateBadgeClasses(state.tone)}`}>
                                  {state.label}
                                </span>
                              ) : null}
                            </div>
                            <p className="mt-1.5 text-xs text-stone-500">
                              {application.location || locality} · {formatPlanningDate(application.registration_date)}
                            </p>
                          </Link>
                        </li>
                      )
                    })}
                  </ul>
                </article>
              ))}
            </div>
          </section>
        ) : null}

        <dl className="grid divide-y divide-stone-200 border-b border-stone-200 sm:grid-cols-4 sm:divide-x sm:divide-y-0">
          <Metric value={formatPlanningCount(activeCount)} label="Active applications" />
          <Metric value={formatPlanningCount(dashboard.totalCount)} label="Recorded applications" />
          <Metric value={formatPlanningCount(dashboard.latestMonthCount)} label={latestRegistrationMonthLabel(dashboard.latestRegistrationMonth)} />
          <Metric value={formatPlanningDate(dashboard.latestRegistrationDate)} label="Latest registration" />
        </dl>

        <div className="mt-8 grid gap-10 lg:grid-cols-[minmax(0,1fr)_320px] lg:gap-12">
          <div className="min-w-0 space-y-10">
            <DashboardSection
              eyebrow="Recent activity"
              title="Latest applications"
              description={`Most recently registered applications matching ${locality}.`}
            >
              <PlanningApplicationList applications={latestApplications} />
              <Link className="mt-5 inline-flex min-h-10 items-center text-sm font-semibold text-stone-700 hover:text-stone-950 hover:underline" href={searchHref}>
                View all {formatPlanningCount(dashboard.totalCount)} {locality} applications <span aria-hidden="true" className="ml-1">→</span>
              </Link>
            </DashboardSection>

            {decisionResults.length > 0 ? (
              <DashboardSection
                eyebrow="Decision activity"
                title="Recent decisions"
                description={`Latest recorded decision dates for applications matching ${locality}.`}
              >
                <PlanningApplicationList applications={decisionResults} dateLabel="Decision" />
                <Link className="mt-5 inline-flex min-h-10 items-center text-sm font-semibold text-stone-700 hover:text-stone-950 hover:underline" href={decisionsHref}>
                  Search decision-stage applications <span aria-hidden="true" className="ml-1">→</span>
                </Link>
              </DashboardSection>
            ) : null}
          </div>

          <aside className="min-w-0 space-y-8">
            <StatList
              title="Applications by status"
              description="Current normalised status for recorded applications."
              stats={statusStats}
            />
            {typeStats.length > 0 ? (
              <StatList
                title="Common application types"
                description="Most frequent published type labels."
                stats={typeStats}
              />
            ) : null}
          </aside>
        </div>

        <section className="mt-10 border-t border-stone-200 pt-8">
          <h2 className="text-xl font-semibold tracking-tight text-stone-950">Explore {locality}</h2>
          <div className="mt-4 flex flex-col gap-3 text-sm font-semibold sm:flex-row sm:flex-wrap sm:gap-x-6">
            <Link className="inline-flex min-h-10 items-center text-stone-700 hover:text-stone-950 hover:underline" href={searchHref}>
              All {locality} planning applications <span aria-hidden="true" className="ml-1">→</span>
            </Link>
            <Link className="inline-flex min-h-10 items-center text-stone-700 hover:text-stone-950 hover:underline" href={`/planning/${authority.slug}`}>
              {authority.name} planning <span aria-hidden="true" className="ml-1">→</span>
            </Link>
            <Link className="inline-flex min-h-10 items-center text-stone-700 hover:text-stone-950 hover:underline" href={`/planning/${authority.slug}/areas`}>
              Browse other {authority.shortName} areas <span aria-hidden="true" className="ml-1">→</span>
            </Link>
            {county ? (
              <Link className="inline-flex min-h-10 items-center text-stone-700 hover:text-stone-950 hover:underline" href={`/sold-prices/${areaSlug(county)}/${areaSlug(locality)}`}>
                Sold prices in {locality} <span aria-hidden="true" className="ml-1">→</span>
              </Link>
            ) : null}
          </div>
        </section>

        <section className="mt-8 border-t border-stone-200 pt-6 text-sm leading-6 text-stone-500" aria-labelledby="about-data">
          <h2 id="about-data" className="font-semibold text-stone-700">About this data</h2>
          <p className="mt-2 max-w-3xl">
            OpenList reflects planning records available from {authority.name}. Coverage varies by authority and time period; always check the official council record before relying on an application or decision.
          </p>
        </section>
      </section>
    </main>
  )
}

function localityNotableHref(
  authority: string,
  slug: string,
  options: { includeOlder: boolean; activeOnly: boolean }
) {
  const params = new URLSearchParams()
  if (options.includeOlder) params.set("includeOlder", "1")
  if (options.activeOnly) params.set("activeOnly", "1")
  const query = params.toString()
  return `/planning/${authority}/areas/${slug}${query ? `?${query}` : ""}`
}

function localitySearchHref(authority: string, locality: string, status?: string, construction?: string) {
  const params = new URLSearchParams({ _authority: authority, area: locality })
  if (status) params.set("status", status)
  if (construction) params.set("construction", construction)
  return `/planning/applications?${params}`
}

function Metric({ value, label }: { value: string; label: string }) {
  return (
    <div className="py-5 sm:px-5 sm:first:pl-0 sm:last:pr-0">
      <dd className="text-2xl font-semibold tracking-tight text-stone-950">{value}</dd>
      <dt className="mt-1 text-sm text-stone-500">{label}</dt>
    </div>
  )
}

function DashboardSection({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow: string
  title: string
  description: string
  children: ReactNode
}) {
  return (
    <section>
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-500">{eyebrow}</p>
      <h2 className="mt-2 text-2xl font-semibold tracking-tight text-stone-950">{title}</h2>
      <p className="mt-2 text-sm leading-6 text-stone-500">{description}</p>
      <div className="mt-4 border-y border-stone-200">{children}</div>
    </section>
  )
}

function StatList({
  title,
  description,
  stats,
}: {
  title: string
  description: string
  stats: PlanningCountStat[]
}) {
  const maxCount = Math.max(...stats.map((stat) => stat.count), 1)

  return (
    <section className="border-t border-stone-200 pt-5">
      <h2 className="text-lg font-semibold tracking-tight text-stone-950">{title}</h2>
      <p className="mt-1 text-sm leading-6 text-stone-500">{description}</p>
      {stats.length > 0 ? (
        <ul className="mt-4 space-y-4">
          {stats.map((stat) => (
            <li key={stat.label}>
              <div className="flex items-baseline justify-between gap-4 text-sm">
                <span className="min-w-0 font-medium text-stone-800">{stat.label}</span>
                <span className="shrink-0 font-semibold text-stone-950">
                  {formatPlanningCount(stat.count)}
                </span>
              </div>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-stone-200">
                <div
                  className="h-full rounded-full bg-emerald-700"
                  style={{ width: `${Math.max(6, (stat.count / maxCount) * 100)}%` }}
                />
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-4 text-sm text-stone-500">No summary data is available yet.</p>
      )}
    </section>
  )
}
