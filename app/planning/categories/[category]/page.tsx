import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { PlanningApplicationList } from "@/components/planning/PlanningApplicationResult"
import { formatPlanningCount } from "@/lib/planning-locality-presentation"
import { planningResultRecord } from "@/lib/planning-result-presentation"
import {
  getPlanningPublicCategory,
  getPlanningPublicCategorySummaries,
  PLANNING_PUBLIC_CATEGORIES,
} from "@/lib/planning-public-categories"

export const dynamic = "force-dynamic"
export const dynamicParams = true

type Props = {
  params: Promise<{ category: string }>
  searchParams: Promise<{ includeOlder?: string; authority?: string; page?: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { category: slug } = await params
  const category = PLANNING_PUBLIC_CATEGORIES.find((item) => item.slug === slug)
  if (!category) return { robots: { index: false, follow: true } }
  return {
    title: `${category.label} | OpenList`,
    description: category.description,
    alternates: { canonical: `/planning/categories/${category.slug}` },
    robots: { index: true, follow: true },
  }
}

function categoryHref(
  slug: string,
  authorityCode?: string | null,
  pageNumber = 1
) {
  const query = new URLSearchParams()
  if (authorityCode) query.set("authority", authorityCode)
  if (pageNumber > 1) query.set("page", String(pageNumber))
  const suffix = query.toString()
  return `/planning/categories/${slug}${suffix ? `?${suffix}` : ""}`
}

export default async function PlanningCategoryPage({ params, searchParams }: Props) {
  const { category: slug } = await params
  const query = await searchParams
  const authorityCode = query.authority || null
  const requestedPage = Math.max(1, Number.parseInt(query.page || "1", 10) || 1)
  // Category pages deliberately use the full exact classifier-owned membership.
  // The legacy includeOlder query parameter is accepted by the route but no longer
  // narrows the user-facing corpus to the SEO priority subset.
  const page = await getPlanningPublicCategory(slug, false, authorityCode, requestedPage)
  if (!page || page.overallTotalCount < 3) notFound()
  if (page.totalCount > 0 && page.pageNumber > page.totalPages) notFound()

  const otherCategories = (await getPlanningPublicCategorySummaries(3))
    .filter((category) => category.slug !== slug)
    .slice(0, 8)
  const applications = page.rows.map((row) => planningResultRecord(row.application))
  const selectedAuthorityName = page.selectedAuthority?.shortName ?? null
  const topAuthorities = page.authorities.slice(0, 6)
  const selectedAuthorityEntry = page.selectedAuthority
    ? page.authorities.find(({ authority }) => authority?.code === page.selectedAuthority?.code)
    : null
  const visibleAuthorities = selectedAuthorityEntry && !topAuthorities.some(({ authority }) => authority?.code === selectedAuthorityEntry.authority?.code)
    ? [...topAuthorities, selectedAuthorityEntry]
    : topAuthorities
  const visibleAuthorityCodes = new Set(visibleAuthorities.map(({ authority }) => authority?.code).filter(Boolean))
  const remainingAuthorities = page.authorities.filter(({ authority }) => authority && !visibleAuthorityCodes.has(authority.code))

  const authorityPill = ({ authority, count }: (typeof page.authorities)[number]) => authority ? (
    <Link
      key={authority.code}
      href={categoryHref(slug, authority.code)}
      aria-current={page.selectedAuthority?.code === authority.code ? "page" : undefined}
      className={`inline-flex min-h-10 items-center rounded-lg border px-3 text-sm font-semibold ${
        page.selectedAuthority?.code === authority.code
          ? "border-emerald-700 bg-emerald-700 text-white"
          : "border-emerald-200 bg-white text-stone-800 hover:border-emerald-400 hover:text-emerald-900"
      }`}
    >
      {authority.shortName}<span className={`ml-2 ${page.selectedAuthority?.code === authority.code ? "text-emerald-100" : "text-stone-500"}`}>{formatPlanningCount(count)}</span>
    </Link>
  ) : null

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
            {formatPlanningCount(page.totalCount)} applications identified{selectedAuthorityName ? ` in ${selectedAuthorityName}` : ""} · <span className="text-emerald-800">{formatPlanningCount(page.activeCount)} currently active</span>
          </p>
          <div className="mt-6 flex flex-wrap gap-3 text-sm font-semibold">
            <Link href="/planning" className="inline-flex min-h-10 items-center rounded-lg border border-stone-300 bg-white px-4 text-stone-800 hover:border-stone-500">
              Search all Planning
            </Link>
            <Link href="/planning/categories" className="inline-flex min-h-10 items-center rounded-lg border border-stone-300 bg-white px-4 text-stone-800 hover:border-stone-500">
              Browse all development types
            </Link>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:py-10">
        {page.authorities.length > 0 ? (
          <section className="rounded-2xl border border-emerald-200 bg-emerald-50/70 p-5 sm:p-6">
            <div>
              <h2 className="text-xl font-semibold tracking-tight text-stone-950">Where these applications are</h2>
              <p className="mt-1 text-sm text-stone-600">Filter by local authority.</p>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <Link
                href={categoryHref(slug)}
                aria-current={!page.selectedAuthority ? "page" : undefined}
                className={`inline-flex min-h-10 items-center rounded-lg border px-3 text-sm font-semibold ${
                  !page.selectedAuthority
                    ? "border-emerald-700 bg-emerald-700 text-white"
                    : "border-emerald-200 bg-white text-stone-800 hover:border-emerald-400 hover:text-emerald-900"
                }`}
              >
                All councils<span className={`ml-2 ${!page.selectedAuthority ? "text-emerald-100" : "text-stone-500"}`}>{formatPlanningCount(page.overallTotalCount)}</span>
              </Link>
              {visibleAuthorities.map(authorityPill)}
            </div>
            {remainingAuthorities.length > 0 ? (
              <details className="mt-3">
                <summary className="cursor-pointer select-none text-sm font-semibold text-emerald-800 hover:text-emerald-950">
                  Show all {formatPlanningCount(page.authorities.length)} councils
                </summary>
                <div className="mt-3 flex flex-wrap gap-2">
                  {remainingAuthorities.map(authorityPill)}
                </div>
              </details>
            ) : null}
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
            <span className="text-sm text-stone-500">Page {formatPlanningCount(page.pageNumber)} of {formatPlanningCount(page.totalPages)} · showing {formatPlanningCount(applications.length)} of {formatPlanningCount(page.totalCount)}</span>
          </div>
          <div className="mt-4 border-y border-stone-200 bg-white">
            <PlanningApplicationList applications={applications} />
          </div>
          {page.totalPages > 1 ? (
            <nav className="mt-6 flex items-center justify-between gap-4" aria-label="Category result pages">
              {page.pageNumber > 1 ? (
                <Link
                  rel="prev"
                  href={categoryHref(slug, page.selectedAuthority?.code, page.pageNumber - 1)}
                  className="inline-flex min-h-11 items-center rounded-lg border border-stone-300 bg-white px-4 text-sm font-semibold text-stone-800 hover:border-stone-500"
                >
                  ← Previous
                </Link>
              ) : <span />}
              {page.pageNumber < page.totalPages ? (
                <Link
                  rel="next"
                  href={categoryHref(slug, page.selectedAuthority?.code, page.pageNumber + 1)}
                  className="inline-flex min-h-11 items-center rounded-lg border border-stone-300 bg-white px-4 text-sm font-semibold text-stone-800 hover:border-stone-500"
                >
                  Next →
                </Link>
              ) : null}
            </nav>
          ) : null}
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
