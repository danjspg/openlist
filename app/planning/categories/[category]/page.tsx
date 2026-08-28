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

export const revalidate = 21600
export const dynamicParams = true

type Props = { params: Promise<{ category: string }> }

export function generateStaticParams() {
  return PLANNING_PUBLIC_CATEGORIES.map((category) => ({ category: category.slug }))
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { category: slug } = await params
  const page = await getPlanningPublicCategory(slug)
  if (!page || page.rows.length < 3) return { robots: { index: false, follow: true } }
  return {
    title: `${page.category.label} | OpenList`,
    description: `${page.category.description} Browse ${formatPlanningCount(page.rows.length)} current or recent priority planning applications.`,
    alternates: { canonical: `/planning/categories/${page.category.slug}` },
    robots: { index: true, follow: true },
  }
}

export default async function PlanningCategoryPage({ params }: Props) {
  const { category: slug } = await params
  const page = await getPlanningPublicCategory(slug)
  if (!page || page.rows.length < 3) notFound()

  const otherCategories = (await getPlanningPublicCategorySummaries(3))
    .filter((category) => category.slug !== slug)
    .slice(0, 8)
  const applications = page.rows.slice(0, 40).map((row) => planningResultRecord(row.application))

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
            {formatPlanningCount(page.rows.length)} priority applications currently identified
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
            <h2 className="text-xl font-semibold tracking-tight text-stone-950">Where these applications are</h2>
            <p className="mt-1 text-sm text-stone-600">Explore the councils with the most matching development activity.</p>
            <div className="mt-4 flex flex-wrap gap-2">
              {page.authorities.slice(0, 12).map(({ authority, count }) => authority ? (
                <Link key={authority.code} href={`/planning/${authority.slug}`} className="inline-flex min-h-10 items-center rounded-lg border border-emerald-200 bg-white px-3 text-sm font-semibold text-stone-800 hover:border-emerald-400 hover:text-emerald-900">
                  {authority.shortName}<span className="ml-2 text-stone-500">{formatPlanningCount(count)}</span>
                </Link>
              ) : null)}
            </div>
          </section>
        ) : null}

        <section className="mt-8">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-500">Latest activity</p>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight text-stone-950">Recent {page.category.shortLabel.toLowerCase()} applications</h2>
            </div>
            <span className="text-sm text-stone-500">Showing up to 40</span>
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
