import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import type { ReactNode } from "react"
import { PlanningApplicationList } from "@/components/planning/PlanningApplicationResult"
import { getSoldPricesLocalityMembership } from "@/lib/locality-seo"
import {
  formatPlanningDate,
  getPlanningLocalityDashboard,
  type PlanningCountStat,
} from "@/lib/planning"
import { getPlanningAuthorityBySlug } from "@/lib/planning-authorities"
import {
  formatPlanningCount,
  latestRegistrationMonthLabel,
  localityStatusStats,
} from "@/lib/planning-locality-presentation"
import { planningResultRecord } from "@/lib/planning-result-presentation"
import { areaSlug } from "@/lib/ppr"
import { countyForPlanningAuthority } from "@/lib/property-intelligence"

export const revalidate = 21600
export const dynamicParams = true
export function generateStaticParams() {
  return []
}

type Props = { params: Promise<{ authority: string; areaSlug: string }> }

async function resolve(params: Props["params"]) {
  const { authority: authoritySlug, areaSlug: slug } = await params
  const authority = getPlanningAuthorityBySlug(authoritySlug)
  if (!authority || areaSlug(slug) !== slug) return null

  const localityPage = await getPlanningLocalityDashboard(authority, slug)
  if (!localityPage) return null

  const county = countyForPlanningAuthority(authority.code)
  const soldPrices = county
    ? await getSoldPricesLocalityMembership(county, slug)
    : null

  return { authority, slug, county, soldPrices, ...localityPage }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const page = await resolve(params)
  if (!page) return {}

  return {
    title: `${page.locality} Planning Applications | Recent Activity & Decisions`,
    description: `${formatPlanningCount(page.dashboard.totalCount)} recorded ${page.locality} planning applications from ${page.authority.name}, with recent registrations, decisions and status information.`,
    alternates: { canonical: `/planning/${page.authority.slug}/areas/${page.slug}` },
    robots: { index: true, follow: true },
  }
}

export default async function PlanningLocalityPage({ params }: Props) {
  const page = await resolve(params)
  if (!page) notFound()

  const { authority, locality, dashboard, recentDecisions, county, soldPrices } = page
  const searchHref = localitySearchHref(authority.slug, locality)
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
            {formatPlanningCount(dashboard.totalCount)} recorded applications from {authority.name}
          </p>
          <p className="mt-1 text-sm text-stone-500">
            Latest registration: {formatPlanningDate(dashboard.latestRegistrationDate)}
          </p>
          <nav className="mt-5 flex flex-wrap gap-x-5 gap-y-3 text-sm font-semibold text-stone-700" aria-label={`${locality} planning links`}>
            <Link className="inline-flex min-h-10 items-center hover:text-stone-950 hover:underline" href={searchHref}>
              Search {locality} planning <span aria-hidden="true" className="ml-1">→</span>
            </Link>
            <Link className="inline-flex min-h-10 items-center hover:text-stone-950 hover:underline" href={`/planning/${authority.slug}`}>
              {authority.shortName} planning
            </Link>
            {soldPrices && county ? (
              <Link className="inline-flex min-h-10 items-center hover:text-stone-950 hover:underline" href={`/sold-prices/${areaSlug(county)}/${soldPrices.locality_slug}`}>
                Sold prices in {locality} <span aria-hidden="true" className="ml-1">→</span>
              </Link>
            ) : null}
          </nav>
        </header>

        <dl className="grid divide-y divide-stone-200 border-b border-stone-200 sm:grid-cols-3 sm:divide-x sm:divide-y-0">
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
            {soldPrices && county ? (
              <Link className="inline-flex min-h-10 items-center text-stone-700 hover:text-stone-950 hover:underline" href={`/sold-prices/${areaSlug(county)}/${soldPrices.locality_slug}`}>
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

function localitySearchHref(authority: string, locality: string, status?: string) {
  const params = new URLSearchParams({ area: locality })
  if (status) params.set("status", status)
  return `/planning/${authority}?${params}`
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
