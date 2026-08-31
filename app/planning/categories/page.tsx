import type { Metadata } from "next"
import Link from "next/link"
import { PLANNING_PUBLIC_CATEGORIES } from "@/lib/planning-public-categories"

export const dynamic = "force-dynamic"
export const revalidate = 21600

export const metadata: Metadata = {
  title: "Planning by Development Type | OpenList",
  description: "Browse notable Irish planning applications by development type, including padel, housing, wind farms, retail, data centres and infrastructure.",
  alternates: { canonical: "/planning/categories" },
  robots: { index: true, follow: true },
}

export default function PlanningCategoriesPage() {
  return (
    <main className="min-h-screen bg-stone-50">
      <section className="border-b border-stone-200 bg-white">
        <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 lg:py-14">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-800">Explore Planning</p>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight text-stone-950 sm:text-5xl">Planning by development type</h1>
          <p className="mt-4 max-w-3xl text-lg leading-8 text-stone-600">Follow the kinds of developments people care about, from large housing schemes and padel courts to wind farms, retail, data centres and major infrastructure.</p>
          <Link href="/planning" className="mt-6 inline-flex min-h-10 items-center text-sm font-semibold text-emerald-900 hover:underline">Search all Planning <span className="ml-1" aria-hidden="true">→</span></Link>
        </div>
      </section>
      <section className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:py-10">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {PLANNING_PUBLIC_CATEGORIES.map((category) => (
            <Link key={category.slug} href={`/planning/categories/${category.slug}`} className="group rounded-2xl border border-stone-200 bg-white p-5 shadow-sm transition hover:border-emerald-300 hover:shadow-md">
              <h2 className="text-xl font-semibold tracking-tight text-stone-950 group-hover:text-emerald-900">{category.shortLabel}</h2>
              <p className="mt-3 text-sm leading-6 text-stone-600">{category.description}</p>
              <p className="mt-4 text-sm font-semibold text-emerald-800">View applications <span aria-hidden="true">→</span></p>
            </Link>
          ))}
        </div>
      </section>
    </main>
  )
}
