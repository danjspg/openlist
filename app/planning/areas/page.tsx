import type { Metadata } from "next"
import Link from "next/link"
import { getLocalitySitemap } from "@/lib/locality-seo"
import { getPlanningAuthorityBySlug } from "@/lib/planning-authorities"
import { countyForPlanningAuthority } from "@/lib/property-intelligence"

export const revalidate = 21600

export const metadata: Metadata = {
  title: "Browse Planning Areas Ireland | OpenList",
  description: "Browse OpenList planning area pages across Ireland, grouped by county and planning authority.",
  alternates: { canonical: "/planning/areas" },
  robots: { index: true, follow: true },
}

type AreaEntry = {
  path: string
  label: string
  county: string
  authority: string
}

function titleFromSlug(slug: string) {
  return slug
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ")
}

function parseArea(path: string): AreaEntry | null {
  const match = path.match(/^\/planning\/([^/]+)\/areas\/([^/]+)$/)
  if (!match) return null

  const authority = getPlanningAuthorityBySlug(match[1])
  if (!authority) return null

  return {
    path,
    label: titleFromSlug(match[2]),
    county: countyForPlanningAuthority(authority.code) ?? authority.shortName,
    authority: authority.shortName,
  }
}

export default async function PlanningAreasPage() {
  const entries = (await getLocalitySitemap("planning"))
    .map((row) => parseArea(row.canonical_path))
    .filter((entry): entry is AreaEntry => Boolean(entry))
    .sort((left, right) =>
      left.county.localeCompare(right.county, "en-IE", { sensitivity: "base" }) ||
      left.label.localeCompare(right.label, "en-IE", { sensitivity: "base" }) ||
      left.authority.localeCompare(right.authority, "en-IE", { sensitivity: "base" })
    )

  const grouped = entries.reduce((map, entry) => {
    const list = map.get(entry.county) ?? []
    list.push(entry)
    map.set(entry.county, list)
    return map
  }, new Map<string, AreaEntry[]>())

  return (
    <main className="min-h-screen bg-stone-50">
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
            Explore area pages with recent planning activity, decisions and notable local developments. Areas are grouped by county; where a county has more than one planning authority, the authority is shown for clarity.
          </p>
          <p className="mt-3 text-sm text-stone-500">
            Showing {entries.length.toLocaleString("en-IE")} currently featured planning areas.
          </p>
        </header>

        {grouped.size ? (
          <div className="mt-10 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            {[...grouped.entries()].map(([county, areas]) => {
              const hasMultipleAuthorities = new Set(areas.map((area) => area.authority)).size > 1
              return (
                <section key={county} className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
                  <div className="flex items-baseline justify-between gap-4 border-b border-stone-100 pb-3">
                    <h2 className="text-lg font-semibold tracking-tight text-stone-950">{county}</h2>
                    <span className="text-xs text-stone-400">{areas.length} areas</span>
                  </div>
                  <ul className="mt-2 divide-y divide-stone-100">
                    {areas.map((area) => (
                      <li key={area.path}>
                        <Link className="group flex min-h-12 items-center justify-between gap-4 py-2.5" href={area.path}>
                          <span className="min-w-0">
                            <span className="block font-medium text-stone-800 group-hover:text-emerald-800 group-hover:underline">{area.label}</span>
                            {hasMultipleAuthorities ? <span className="mt-0.5 block text-xs text-stone-400">{area.authority}</span> : null}
                          </span>
                          <span className="shrink-0 text-stone-400 group-hover:text-stone-700" aria-hidden="true">→</span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </section>
              )
            })}
          </div>
        ) : (
          <div className="mt-10 rounded-2xl border border-stone-200 bg-white p-6 text-stone-600">
            Planning area navigation is temporarily unavailable. You can still search all planning applications from the main Planning page.
          </div>
        )}
      </section>
    </main>
  )
}
