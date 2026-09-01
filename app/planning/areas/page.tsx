import type { Metadata } from "next"
import Link from "@/components/RuntimeDataLink"
import { getPlanningLocalityDirectory } from "@/lib/locality-seo"
import { getPlanningAuthorityByCode } from "@/lib/planning-authorities"
import { countyForPlanningAuthority } from "@/lib/property-intelligence"

export const dynamic = "force-dynamic"

export const metadata: Metadata = {
  title: "Browse Planning Areas Ireland | OpenList",
  description: "Browse planning areas across Ireland by local authority, with the busiest localities surfaced first and full council-level area directories available.",
  alternates: { canonical: "/planning/areas" },
  robots: { index: true, follow: true },
}

type AreaEntry = {
  path: string
  label: string
  county: string
  authorityName: string
  authoritySlug: string
  activeCount: number
}

type AuthorityGroup = {
  authorityName: string
  authoritySlug: string
  county: string
  areas: AreaEntry[]
  activity: number
}

type Props = {
  searchParams: Promise<{ q?: string | string[] }>
}

function one(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] ?? "" : value ?? ""
}

export default async function PlanningAreasPage({ searchParams }: Props) {
  const memberships = await getPlanningLocalityDirectory().catch(() => [])
  const params = await searchParams
  const query = one(params.q).trim()
  const normalizedQuery = query.toLocaleLowerCase("en-IE")
  const nf = new Intl.NumberFormat("en-IE")

  const entries: AreaEntry[] = memberships.flatMap((membership) => {
    const authority = membership.authority_code ? getPlanningAuthorityByCode(membership.authority_code) : null
    if (!authority) return []
    return [{
      path: membership.canonical_path,
      label: membership.locality_label,
      county: membership.county || countyForPlanningAuthority(authority.code) || authority.shortName,
      authorityName: authority.shortName,
      authoritySlug: authority.slug,
      activeCount: membership.activeCount,
    }]
  })

  const rankedAreas = [...entries].sort((a, b) => b.activeCount - a.activeCount || a.label.localeCompare(b.label, "en-IE", { sensitivity: "base" }))
  const featured = rankedAreas.slice(0, 8)
  const matches = normalizedQuery
    ? rankedAreas
        .filter((area) => `${area.label} ${area.authorityName} ${area.county}`.toLocaleLowerCase("en-IE").includes(normalizedQuery))
        .slice(0, 80)
    : []

  const grouped = new Map<string, AreaEntry[]>()
  for (const entry of entries) {
    const list = grouped.get(entry.authoritySlug) || []
    list.push(entry)
    grouped.set(entry.authoritySlug, list)
  }

  const groups: AuthorityGroup[] = [...grouped.values()].map((areas) => ({
    authorityName: areas[0].authorityName,
    authoritySlug: areas[0].authoritySlug,
    county: areas[0].county,
    areas: [...areas].sort((a, b) => b.activeCount - a.activeCount || a.label.localeCompare(b.label, "en-IE", { sensitivity: "base" })),
    activity: areas.reduce((sum, area) => sum + area.activeCount, 0),
  })).sort((a, b) => b.activity - a.activity || a.authorityName.localeCompare(b.authorityName, "en-IE", { sensitivity: "base" }))

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
          <p className="mt-4 text-base leading-7 text-stone-600 sm:text-lg">Search a town, suburb, postal district or locality, or browse the busiest areas and complete council directories.</p>
          <p className="mt-3 text-sm text-stone-500">{nf.format(entries.length)} area pages with recent planning activity, decisions and notable local developments.</p>
        </header>

        <form action="/planning/areas" method="get" className="mt-7 flex max-w-3xl gap-2 rounded-2xl border border-stone-300 bg-white p-2 shadow-sm">
          <input name="q" type="search" defaultValue={query} aria-label="Find a planning area" placeholder="Town, suburb, postal district or locality" className="min-h-12 min-w-0 flex-1 rounded-xl px-3 text-sm outline-none placeholder:text-stone-400 focus:bg-stone-50 sm:text-base" />
          <button className="min-h-12 rounded-xl bg-stone-950 px-5 text-sm font-semibold text-white transition hover:bg-stone-700">Find area</button>
        </form>

        {query ? (
          <section className="mt-9" aria-labelledby="area-search-results">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700">Area finder</p>
                <h2 id="area-search-results" className="mt-1 text-2xl font-semibold tracking-tight text-stone-950">Matches for “{query}”</h2>
                <p className="mt-2 text-sm text-stone-500">{matches.length ? `${nf.format(matches.length)} matching area${matches.length === 1 ? "" : "s"}. Council names are shown to distinguish duplicate place names.` : "No matching planning area was found."}</p>
              </div>
              <Link href="/planning/areas" className="text-sm font-semibold text-stone-600 hover:text-stone-950 hover:underline">Clear search</Link>
            </div>

            {matches.length ? (
              <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {matches.map((area) => (
                  <Link key={area.path} href={area.path} className="group rounded-2xl border border-stone-200 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-emerald-200 hover:shadow-md">
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <h3 className="text-lg font-semibold tracking-tight text-stone-950 group-hover:text-emerald-800">{area.label}</h3>
                        <p className="mt-1 text-sm font-medium text-stone-600">{area.authorityName}</p>
                        <p className="mt-1 text-xs text-stone-400">{area.county}</p>
                      </div>
                      <span className="shrink-0 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-800">{nf.format(area.activeCount)} active</span>
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="mt-5 rounded-2xl border border-stone-200 bg-white p-5 text-sm leading-6 text-stone-600">Try a shorter place name, a nearby town, or browse by planning authority below.</div>
            )}
          </section>
        ) : featured.length ? (
          <section className="mt-9 rounded-3xl border border-emerald-100 bg-emerald-50/40 p-5 sm:p-6" aria-labelledby="most-active-areas">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-800">Most active now</p>
            <h2 id="most-active-areas" className="mt-1 text-2xl font-semibold tracking-tight text-stone-950">Busy planning areas</h2>
            <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {featured.map((area, index) => (
                <Link key={area.path} href={area.path} className="group rounded-2xl border border-stone-200 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-emerald-200 hover:shadow-md">
                  <div className="flex items-start justify-between gap-3">
                    <span className="text-xs font-semibold text-stone-400">#{index + 1}</span>
                    <span className="text-xs font-medium text-emerald-800">{nf.format(area.activeCount)} active</span>
                  </div>
                  <h3 className="mt-3 text-lg font-semibold tracking-tight text-stone-950 group-hover:text-emerald-800">{area.label}</h3>
                  <p className="mt-1 text-sm text-stone-500">{area.authorityName}</p>
                </Link>
              ))}
            </div>
          </section>
        ) : null}

        <section className="mt-10" aria-labelledby="browse-by-authority">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-500">Complete directory</p>
          <h2 id="browse-by-authority" className="mt-1 text-2xl font-semibold tracking-tight text-stone-950">Browse by planning authority</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-stone-600">Each authority page contains its full area list. The hub shows only the busiest localities so the directory stays useful as coverage grows.</p>

          <div className="mt-6 grid gap-4 lg:grid-cols-2">
            {groups.map((group) => (
              <article key={group.authoritySlug} className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h3 className="text-lg font-semibold tracking-tight text-stone-950">{group.authorityName}</h3>
                    <p className="mt-1 text-xs text-stone-500">{group.county} · {nf.format(group.areas.length)} areas</p>
                  </div>
                  <Link className="shrink-0 text-sm font-semibold text-emerald-800 hover:underline" href={`/planning/${group.authoritySlug}/areas`}>All areas →</Link>
                </div>
                <ul className="mt-4 grid gap-x-5 gap-y-2 sm:grid-cols-2">
                  {group.areas.slice(0, 8).map((area) => (
                    <li key={area.path}>
                      <Link className="flex items-center justify-between gap-3 py-1.5 text-sm font-medium text-stone-700 hover:text-emerald-800 hover:underline" href={area.path}>
                        <span>{area.label}</span>
                        <span className="shrink-0 text-xs font-normal text-stone-400">{nf.format(area.activeCount)}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
        </section>
      </section>
    </main>
  )
}
