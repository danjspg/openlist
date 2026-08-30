import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { PlanningApplicationList } from "@/components/planning/PlanningApplicationResult"
import { formatPlanningCount } from "@/lib/planning-locality-presentation"
import { planningResultRecord } from "@/lib/planning-result-presentation"
import {
  getPlanningPublicCategory,
  getPlanningPublicCategorySummary,
  getPlanningPublicCategorySummaries,
  PLANNING_PUBLIC_CATEGORIES,
} from "@/lib/planning-public-categories"

export const revalidate = 21600
export const dynamicParams = true

type Props = {
  params: Promise<{ category: string }>
  searchParams: Promise<{ includeOlder?: string; authority?: string }>
}

export function generateStaticParams() {
  return PLANNING_PUBLIC_CATEGORIES.map((category) => ({ category: category.slug }))
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { category: slug } = await params
  const summary = await getPlanningPublicCategorySummary(slug)
  if (!summary || summary.totalCount < 3) return { robots: { index: false, follow: true } }
  return {
    title: `${summary.category.label} | OpenList`,
    description: `${summary.category.description} Browse ${formatPlanningCount(summary.totalCount)} current or recent priority planning applications.`,
    alternates: { canonical: `/planning/categories/${summary.category.slug}` },
    robots: { index: true, follow: true },
  }
}

function categoryHref(slug: string, includeOlder: boolean, authorityCode?: string | null) {
  const query = new URLSearchParams()
  if (includeOlder) query.set("includeOlder", "1")
  if (authorityCode) query.set("authority", authorityCode)
  const suffix = query.toString()
  return `/planning/categories/${slug}${suffix ? `?${suffix}` : ""}`
}

export default async function PlanningCategoryPage({ params, searchParams }: Props) {
  const { category: slug } = await params
  const query = await searchParams
  const includeOlder = query.includeOlder === "1"
  const authorityCode = query.authority || null
  const page = await getPlanningPublicCategory(slug, includeOlder, authorityCode)
  if (!page || page.overallTotalCount < 3) notFound()

  const otherCategories = (await getPlanningPublicCategorySummaries(3))
    .filter((category) => category.slug !== slug)
    .slice(0, 8)
  const applications = page.rows.map((row) => planningResultRecord(row.application))
  const selectedAuthorityName = page.selectedAuthority?.shortName ?? null
  const toggleHref = categoryHref(slug, !includeOlder, page.selectedAuthority?.code)

  return (
    <main className="min-h-screen bg-stone-50">
      <section className="border-b border-stone-200 bg-white">
        <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 lg:py-14">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-800">
            Planning by development type
          </p>
          <h1 className="mt-3 max-w-4xl text-4xl font-semibold tracking-tight text-stone-950 sm:text-5xl">
            {page.category.label}
          </h1>
          <p className="mt-4 max-w-3xl text-lg leading-8 text-stone-600">
            {page.category.description}
          </p>
          <p className="mt-3 text-sm font-medium text-stone-600">
            {formatPlanningCount(page.totalCount)} {includeOlder ? "current and older notable" : "priority"} applications identified{selectedAuthorityName ? ` in ${selectedAuthorityName}` : ""}
          </p>
          <div className="mt-6 flex flex-wrap gap-3 text-sm font-semibold">
            <Link href="/planning" className="inline-flex min-h-10 items-center rounded-lg border border-stone-300 bg-white px-4 text-stone-800 hover:border-stone-500">
              Search all Planning
            </Link>
            <Link href="/planning/categories" className="inline-flex min-h-10 items-center rounded-lg border border-stone-300 bg-white px-4 text-stone-800 hover:border-stone-500">
              Browse all development types
            </Link>
          </div>
          <Link
            href={toggleHref}
            role="switch"
            aria-checked={includeOlder}
            className="mt-5 inline-flex min-h-11 items-center gap-3 rounded-full border border-stone-300 bg-white px-4 text-sm font-semibold text-stone-800 hover:border-stone-500"
          >
            <span aria-hidden="true" className={`h-5 w-9 rounded-full p-0.5 ${includeOlder ? "bg-emerald-700" : "bg-stone-300"}`}><span className={`block h-4 w-4 rounded-full bg-white transition ${includeOlder ? "translate-x-4" : ""}`} /></span>
            Include older applications
          </Link>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:py-10">
        {page.authorities.length > 0 ? (
          <section className="rounded-2xl border border-emerald-200 bg-emerald-50/70 p-5 sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-xl font-semibold tracking-tight text-stone-950">Where these applications are</h2>
                <p className="mt-1 text-sm text-stone-600">Choose a council to filter this development type directly.</p>
              </div>
              {page.selectedAuthority ? (
                <Link
                  href={categoryHref(slug, includeOlder)}
                  className="inline-flex min-h-10 items-center rounded-lg border border-stone-300 bg-white px-3 text-sm font-semibold text-stone-700 hover:border-stone-500"
                >
                  Show all councils
                </Link>
              ) : null}
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {page.authorities.map(({ authority, count }) => authority ? (
                <Link
                  key={authority.code}
                  href={categoryHref(slug, includeOlder, authority.code)}
                  aria-current={page.selectedAuthority?.code === authority.code ? "page" : undefined}
                  className={`inline-flex min-h-10 items-center rounded-lg border px-3 text-sm font-semibold ${
                    page.selectedAuthority?.code === authority.code
                      ? "border-emerald-700 bg-emerald-700 text-white"
                      : "border-emerald-200 bg-white text-stone-800 hover:border-emerald-400 hover:text-emerald-900"
                  }`}
                >
                  {authority.shortName}<span className={`ml-2 ${page.selectedAuthority?.code === authority.code ? "text-emerald-100" : "text-stone-500"}`}>{formatPlanningCount(count)}</span>
                </Link>
              ) : null)}
            </div>
          </section>
        ) : null}

        <section className="mt-8">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-500">Latest activity</p>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight text-stone-950">
                {selectedAuthorityName ? `${selectedAuthorityName} ${page.category.shortLabel.toLowerCase()} applications` : `Recent ${page.category.shortLabel.toLowerCase()} applications`}
              </h2>
            </div>
            <span className="text-sm text-stone-500">Showing {formatPlanningCount(applications.length)} of {formatPlanningCount(page.totalCount)}</span>
          </div>
          <div className="mt-4 border-y border-stone-200 bg-white">
            <PlanningApplicationList applications={applications} />
          </div>
        </section>

        {otherCategories.length > 0 ? (
          <section className="mt-10 border-t border-stone-200 pt-8">
            <h2 className="text-xl font-semibold tracking-tight text-stone-950">Explore other development types</h2>
            <div className="mt-4 flex flex-wrap gap-2">
              {otherCategories.map((category) => (
                <Link key={category.slug} href={`/planning/categories/${category.slug}`} className="inline-flex min-h-10 items-center rounded-lg border border-stone-200 bg-white px-3 text-sm font-semibold text-stone-800 hover:border-stone-400">
                  {category.shortLabel}<span className="ml-2 text-stone-500">{formatPlanningCount(category.count)}</span>
                </Link>
              ))}
            </div>
          </section>
        ) : null}
      </section>
    </main>
  )
}
