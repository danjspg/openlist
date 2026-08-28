import Link from "next/link"
import { formatPlanningCount } from "@/lib/planning-locality-presentation"
import { getPlanningPublicCategorySummaries } from "@/lib/planning-public-categories"

export async function PlanningCategoryLinks({ embedded = false }: { embedded?: boolean } = {}) {
  const categories = (await getPlanningPublicCategorySummaries(3)).slice(0, 10)
  if (!categories.length) return null

  return (
    <section
      className={
        embedded
          ? "mt-8 rounded-xl border border-emerald-200 bg-emerald-50/70 p-4 sm:p-5"
          : "border-b border-emerald-200 bg-emerald-50/70"
      }
    >
      <div className={embedded ? "" : "mx-auto max-w-6xl px-4 py-5 sm:px-6"}>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-800">
              Browse by development type
            </p>
            <p className="mt-1 text-sm text-stone-600">
              Follow notable applications by topic, not just by council or area.
            </p>
          </div>
          <Link href="/planning/categories" className="text-sm font-semibold text-emerald-900 hover:underline">
            All development types <span aria-hidden="true">→</span>
          </Link>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {categories.map((category) => (
            <Link
              key={category.slug}
              href={`/planning/categories/${category.slug}`}
              className="inline-flex min-h-10 items-center rounded-lg border border-emerald-200 bg-white px-3 text-sm font-semibold text-stone-800 transition hover:border-emerald-400 hover:text-emerald-900"
            >
              {category.shortLabel}
              <span className="ml-2 text-stone-500">{formatPlanningCount(category.count)}</span>
            </Link>
          ))}
        </div>
      </div>
    </section>
  )
}
