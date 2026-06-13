import type { Metadata } from "next"
import Link from "next/link"

export const metadata: Metadata = {
  title: "Planning Tools | OpenList",
  description:
    "Search Cork County planning applications and review monthly building commencement trends with OpenList planning tools.",
  alternates: {
    canonical: "/planning",
  },
  robots: {
    index: true,
    follow: true,
  },
}

export default function PlanningToolsPage() {
  return (
    <main className="bg-stone-50">
      <section className="border-b border-stone-200 bg-white">
        <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 lg:py-16">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-stone-500">
            Public planning metadata
          </p>
          <h1 className="mt-4 max-w-3xl text-4xl font-semibold tracking-tight text-stone-950 sm:text-5xl">
            Planning Tools
          </h1>
          <p className="mt-5 max-w-2xl text-lg leading-8 text-stone-600">
            Search individual Cork County planning applications and review
            monthly building commencement trends from public planning and
            housing datasets.
          </p>
        </div>
      </section>

      <section className="mx-auto grid max-w-6xl gap-6 px-4 py-8 sm:px-6 md:grid-cols-2 lg:py-10">
        <PlanningToolCard
          title="Planning Applications"
          description="Find individual Cork County Council applications by reference, location, applicant, status and application type."
          href="/planning/applications"
          cta="Search planning applications"
        />
        <PlanningToolCard
          title="Building Commencements"
          description="Review monthly construction-start trends, commencement notices, housing-unit counts and apartment indicators."
          href="/planning/commencements"
          cta="View building commencements"
        />
      </section>
    </main>
  )
}

function PlanningToolCard({
  title,
  description,
  href,
  cta,
}: {
  title: string
  description: string
  href: string
  cta: string
}) {
  return (
    <Link
      href={href}
      className="group rounded-lg border border-stone-200 bg-white p-6 shadow-sm transition hover:border-stone-300 hover:shadow-md"
    >
      <h2 className="text-2xl font-semibold tracking-tight text-stone-950">
        {title}
      </h2>
      <p className="mt-3 text-sm leading-6 text-stone-600">{description}</p>
      <span className="mt-6 inline-flex text-sm font-semibold text-stone-700 transition group-hover:text-stone-950">
        {cta}
      </span>
    </Link>
  )
}
