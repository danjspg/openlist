import type { Metadata } from "next"
import Link from "@/components/RuntimeDataLink"
import { notFound } from "next/navigation"
import { PlanningApplicationsView } from "@/app/planning/applications/PlanningApplicationsPage"
import { getPlanningAuthorityBySlug } from "@/lib/planning-authorities"
import type { PlanningSearchParams } from "@/lib/planning"

export const dynamic = "force-dynamic"

type FilteredPlanningParams = PlanningSearchParams & {
  _authority?: string
}

export async function generateMetadata({
  searchParams,
}: {
  searchParams?: Promise<FilteredPlanningParams>
}): Promise<Metadata> {
  const resolved = await (
    searchParams || Promise.resolve({} as FilteredPlanningParams)
  )
  const authority = resolved._authority
    ? getPlanningAuthorityBySlug(resolved._authority)
    : null

  return {
    title: authority
      ? `${authority.shortName} Planning Search | OpenList`
      : "Planning Search | OpenList",
    alternates: {
      canonical: authority ? `/planning/${authority.slug}` : "/planning",
    },
    robots: {
      index: false,
      follow: true,
    },
  }
}

export default async function FilteredPlanningPage({
  searchParams,
}: {
  searchParams?: Promise<FilteredPlanningParams>
}) {
  const resolved = await (
    searchParams || Promise.resolve({} as FilteredPlanningParams)
  )
  const authority = resolved._authority
    ? getPlanningAuthorityBySlug(resolved._authority)
    : null

  if (resolved._authority && !authority) notFound()

  try {
    return await PlanningApplicationsView({
      searchParams: Promise.resolve(resolved),
      authority: authority ?? undefined,
    })
  } catch (error) {
    if (!(error instanceof Error) || error.message !== "Planning search query unavailable") {
      throw error
    }

    console.warn("Planning search timed out during server render; returning a recoverable page.", {
      classification: "planning_search_unavailable",
    })

    const retryParams = new URLSearchParams()
    for (const [key, value] of Object.entries(resolved)) {
      if (typeof value === "string" && value) retryParams.set(key, value)
    }
    const retryQuery = retryParams.toString()
    const retryHref = `/planning/applications${retryQuery ? `?${retryQuery}` : ""}`

    return (
      <main className="bg-stone-50">
        <section className="mx-auto max-w-6xl px-4 py-10 sm:px-6 lg:py-14">
          <div className="rounded-2xl border border-amber-200 bg-white p-6 shadow-sm sm:p-8">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-stone-500">
              Planning in Ireland
            </p>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight text-stone-950 sm:text-4xl">
              Planning search is temporarily unavailable
            </h1>
            <p className="mt-4 max-w-2xl text-base leading-7 text-stone-600">
              Your search filters are still selected. The data service took too long to respond, so OpenList stopped the request rather than leaving this page stuck loading.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link
                href={retryHref}
                className="inline-flex min-h-11 items-center rounded-lg bg-stone-950 px-5 text-sm font-semibold text-white transition hover:bg-stone-700"
              >
                Try this search again
              </Link>
              <Link
                href={authority ? `/planning/${authority.slug}` : "/planning"}
                className="inline-flex min-h-11 items-center rounded-lg border border-stone-300 bg-white px-5 text-sm font-semibold text-stone-700 transition hover:border-stone-500 hover:text-stone-950"
              >
                Back to planning
              </Link>
            </div>
          </div>
        </section>
      </main>
    )
  }
}
