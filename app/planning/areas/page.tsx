import type { Metadata } from "next"
import Link from "next/link"
import { getPlanningLocalityDirectory } from "@/lib/locality-seo"
import { getPlanningAuthorityByCode } from "@/lib/planning-authorities"
import { countyForPlanningAuthority } from "@/lib/property-intelligence"

export const revalidate = 21600

export const metadata: Metadata = {
  title: "Browse Planning Areas Ireland | OpenList",
  description: "Browse OpenList planning area pages across Ireland, with the busiest currently active areas surfaced first and every featured area available by county.",
  alternates: { canonical: "/planning/areas" },
  robots: { index: true, follow: true },
}

type AreaEntry = {
  path: string
  label: string
  county: string
  authority: string
  activeCount: number
}

type CountyGroup = {
  county: string
  areas: AreaEntry[]
  activity: number
}

export default async function PlanningAreasPage() {
  const memberships = await getPlanningLocalityDirectory()
  const nf = new Intl.NumberFormat("en-IE")

  const entries: AreaEntry[] = memberships.map((membership) => {
    const authority = membership.authority_code ? getPlanningAuthorityByCode(membership.authority_code) : null
    const county = membership.county || (authority ? countyForPlanningAuthority(authority.code) : null) || authority?.shortName || "Other"

    return {
      path: membership.canonical_path,
      label: membership.locality_label,
      county,
      authority: authority?.shortName || "Planning authority",
      activeCount: membership.activeCount,
    }
  })

  const rankedAreas = [...entries].sort((left, right) =>
    right.activeCount - left.activeCount ||
    left.label.localeCompare(right.label, "en-IE", { sensitivity: "base" })
  )
  const featured = rankedAreas.slice(0, 8)

  const groupedMap = entries.reduce((map, entry) => {
    const list = map.get(entry.county) ?? []
    list.push(entry)
    map.set(entry.county, list)
    return map
  }, new Map<string, AreaEntry[]>())

  const groups: CountyGroup[] = [...groupedMap.entries()]
    .map(([county, areas]) => ({
      county,
      areas: [...areas].sort((left, right) =>
        right.activeCount - left.activeCount ||
        left.label.localeCompare(right.label, "en-IE", { sensitivity: "base" })
      ),
      activity: areas.reduce((sum, area) => sum + area.activeCount, 0),
    }))
    .sort((left, right) =>
      right.activity - left.activity ||
      left.county.localeCompare(right.county, "en-IE", { sensitivity: "base" })
    )

  const alphabeticalGroups = [...groups].sort((left, right) =>
    left.county.localeCompare(right.county, "en-IE", { sensitivity: "base" })
  )

  return (
    <main className="min-h-screen bg-stone-50 text-stone-900">
      <section className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-12">
        <nav className="text-sm text-stone-500" aria-label="Breadcrumb">
          <Link className="hover:text-stone-950 hover:underline" href="/planning">Planning</Link>
          <span className="mx-2" aria-hidden="true">/</span>
          <span>Areas</span>
        </nav>

        <header className="mt-6 max-w-3xl">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-stone-500">Planning in Ireland</p>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight text-stone-950 sm:text-5xl">Browse planning by area</h1>
          <p className="mt-4 text-base leading-7 text-stone-600 sm:text-lg">
            Start with the areas seeing the most active planning applications now, or browse every featured area by county.
          </p>
          <p className="mt-3 text-sm text-stone-500">
            {nf.format(entries.length)} area pages with recent planning activity, decisions and notable local developments.
          </p>
        </header>

        {featured.length ? (
          <section className="mt-9 rounded-3xl border border-emerald-100 bg-emerald-50/40 p-5 sm:p-6" aria-labelledby="most-active-areas">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-800">Most active now</p>
                <h2 id="most-active-areas" className="mt-1 text-2xl font-semibold tracking-tight text-stone-950">Busy planning areas</h2>
                <p className="mt-1 text-sm text-stone-600">Ranked by applications currently in OpenList&apos;s canonical active planning states.</p>
              </div>
              <a className="text-sm font-semibold text-emerald-900 hover:underline" href="#all-areas">Browse all areas ↓</a>
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {featured.map((area, index) => (
                <Link
                  key={area.path}
                  href={area.path}
                  className="group rounded-2xl border border-stone-200 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-emerald-200 hover:shadow-md"
                >
                  <div className="flex items-start justify-between gap-3">
                    <span className="text-xs font-semibold text-stone-400">#{index + 1}</span>
                    <span className="text-xs font-medium text-emerald-800">{nf.format(area.activeCount)} active</span>
                  </div>
                  <h3 className="mt-3 text-lg font-semibold tracking-tight text-stone-950 group-hover:text-emerald-800">{area.label}</h3>
                  <p className="mt-1 text-sm text-stone-500">{area.county}</p>
                  <p className="mt-4 text-sm font-medium text-stone-700">View area →</p>
                </Link>
              ))}
            </div>
          </section>
        ) : null}

        {groups.length ? (
          <section id="all-areas" className="mt-10 scroll-mt-6" aria-labelledby="all-areas-heading">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-500">Complete directory</p>
                <h2 id="all-areas-heading" className="mt-1 text-2xl font-semibold tracking-tight text-stone-950">Browse all areas by county</h2>
                <p className="mt-1 text-sm text-stone-600">Counties are ordered by current active planning activity. Every featured area remains available below.</p>
              </div>
            </div>

            <nav className="mt-5 flex gap-2 overflow-x-auto pb-2 text-sm" aria-label="Jump to county">
              {alphabeticalGroups.map((group) => (
                <a
                  key={group.county}
                  href={`#county-${group.county.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}
                  className="whitespace-nowrap rounded-full border border-stone-200 bg-white px-3 py-1.5 font-medium text-stone-600 hover:border-stone-300 hover:text-stone-950"
                >
                  {group.county}
                </a>
              ))}
            </nav>

            <div className="mt-4 space-y-3">
              {groups.map((group, groupIndex) => {
                const hasMultipleAuthorities = new Set(group.areas.map((area) => area.authority)).size > 1
                const countyId = `county-${group.county.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`

                return (
                  <details
                    key={group.county}
                    id={countyId}
                    open={groupIndex < 5}
                    className="scroll-mt-6 rounded-2xl border border-stone-200 bg-white shadow-sm open:border-stone-300"
                  >
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 marker:content-none">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                          <h3 className="text-lg font-semibold tracking-tight text-stone-950">{group.county}</h3>
                          <span className="text-xs font-medium text-stone-400">{group.areas.length} {group.areas.length === 1 ? "area" : "areas"}</span>
                        </div>
                        <p className="mt-1 text-xs text-stone-500">{nf.format(group.activity)} active applications across featured areas</p>
                      </div>
                      <span className="shrink-0 text-sm font-medium text-stone-500">Browse ↓</span>
                    </summary>

                    <div className="border-t border-stone-100 px-5 pb-2">
                      <ul className="divide-y divide-stone-100">
                        {group.areas.map((area) => (
                          <li key={area.path}>
                            <Link className="group flex min-h-14 items-center justify-between gap-4 py-3" href={area.path}>
                              <span className="min-w-0">
                                <span className="block font-medium text-stone-800 group-hover:text-emerald-800 group-hover:underline">{area.label}</span>
                                {hasMultipleAuthorities ? <span className="mt-0.5 block text-xs text-stone-400">{area.authority}</span> : null}
                              </span>
                              <span className="flex shrink-0 items-center gap-3">
                                <span className="text-xs text-stone-400">{nf.format(area.activeCount)} active</span>
                                <span className="text-stone-400 group-hover:text-stone-700" aria-hidden="true">→</span>
                              </span>
                            </Link>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </details>
                )
              })}
            </div>
          </section>
        ) : (
          <div className="mt-10 rounded-2xl border border-stone-200 bg-white p-6 text-stone-600">
            Planning area navigation is temporarily unavailable. You can still search all planning applications from the main Planning page.
          </div>
        )}
      </section>
    </main>
  )
}
