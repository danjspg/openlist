import type { Metadata } from "next"
import Link from "next/link"
import { connection } from "next/server"
import { areaNameFromSlug, formatPprCurrency, formatPprDate } from "@/lib/ppr"
import { formatPlanningDate } from "@/lib/planning"
import { getPlanningAuthorityByCode } from "@/lib/planning-authorities"
import { planningApplicationPath } from "@/lib/property-intelligence"
import { presentPlanningProposal } from "@/lib/planning-presentation"
import { searchPropertyIntelligence } from "@/lib/unified-search"

export const metadata: Metadata = {
  title: "Search Irish Property Data | OpenList",
  description: "Search places, property addresses and planning applications across OpenList.",
  alternates: { canonical: "/search" },
  robots: { index: true, follow: true },
}

export default async function SearchPage({
  searchParams,
}: {
  searchParams?: Promise<{ q?: string }>
}) {
  const resolved = await (searchParams || Promise.resolve({} as { q?: string }))
  const query = String(resolved.q ?? "").trim().slice(0, 120)
  if (query) await connection()
  const results = query
    ? await searchPropertyIntelligence(query)
    : { places: [], addresses: [], planningApplications: [] }
  const resultCount =
    results.places.length + results.addresses.length + results.planningApplications.length

  return (
    <main className="min-h-screen bg-stone-50">
      <section className="border-b border-stone-200 bg-white">
        <div className="mx-auto max-w-5xl px-4 py-12 sm:px-6 lg:py-16">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-emerald-800">OpenList search</p>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight text-stone-950 sm:text-5xl">Search property intelligence</h1>
          <p className="mt-4 max-w-3xl text-lg leading-8 text-stone-600">
            Search an address, area, Eircode or planning reference across sold-price and planning information.
          </p>
          <form action="/search" className="mt-8 flex flex-col gap-3 rounded-2xl border border-stone-300 bg-stone-50 p-4 shadow-sm sm:flex-row">
            <input
              type="search"
              name="q"
              defaultValue={query}
              autoFocus
              aria-label="Search OpenList"
              placeholder="Search an address, area, Eircode or planning reference"
              className="min-h-14 min-w-0 flex-1 rounded-lg border border-stone-300 bg-white px-4 text-base outline-none focus:border-stone-900 focus:ring-2 focus:ring-stone-200"
            />
            <button type="submit" className="min-h-14 rounded-lg bg-stone-950 px-7 text-base font-semibold text-white transition hover:bg-stone-700">Search</button>
          </form>
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-4 py-10 sm:px-6 lg:py-14">
        {!query ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <SearchPath href="/sold-prices" title="Sold prices" text="Search recorded Property Price Register sales by area." />
            <SearchPath href="/planning" title="Planning applications" text="Search by location, reference, proposal, applicant or status." />
          </div>
        ) : (
          <>
            <p className="text-sm text-stone-500">{resultCount} result{resultCount === 1 ? "" : "s"} shown for “{query}”</p>
            <div className="mt-6 space-y-8">
              <ResultSection title="Places" empty="No matching places found.">
                {results.places.map((place) => (
                  <Link key={`${place.county}-${place.areaSlug}`} href={`/sold-prices/${place.county.toLowerCase()}/${place.areaSlug}`} className="block border-t border-stone-200 px-1 py-4 transition hover:bg-stone-50 sm:px-3">
                    <p className="font-semibold text-stone-950">{place.areaLabel}, {place.county}</p>
                    <p className="mt-1 text-sm text-stone-500">{place.salesCount.toLocaleString("en-IE")} recorded sales · Research this area</p>
                  </Link>
                ))}
              </ResultSection>

              <ResultSection title="Properties / addresses" empty="No matching property addresses found.">
                {results.addresses.map((sale) => (
                  <Link key={sale.id} href={sale.county && sale.area_slug ? `/sold-prices/${sale.county.toLowerCase()}/${sale.area_slug}` : "/sold-prices"} className="grid gap-2 border-t border-stone-200 px-1 py-4 transition hover:bg-stone-50 sm:grid-cols-[minmax(0,1fr)_180px] sm:px-3">
                    <div><p className="font-semibold text-stone-950">{sale.address_raw}</p><p className="mt-1 text-sm text-stone-500">{sale.locality || (sale.area_slug ? areaNameFromSlug(sale.area_slug) : sale.county)} · Sold {formatPprDate(sale.date_of_sale)}</p></div>
                    <p className="font-semibold text-stone-900 sm:text-right">{formatPprCurrency(sale.price_eur)}</p>
                  </Link>
                ))}
              </ResultSection>

              <ResultSection title="Planning applications" empty="No matching planning applications found.">
                {results.planningApplications.map((application) => {
                  const authority = getPlanningAuthorityByCode(application.local_authority_code)
                  const href = authority ? planningApplicationPath(authority, application.reference) : "/planning"
                  return (
                    <Link key={application.id} href={href} className="block border-t border-stone-200 px-1 py-4 transition hover:bg-stone-50 sm:px-3">
                      <div className="flex flex-wrap items-baseline justify-between gap-2"><p className="font-mono text-sm font-semibold text-emerald-800">{application.reference}</p><p className="text-sm text-stone-500">{formatPlanningDate(application.registration_date)}</p></div>
                      <p className="mt-2 font-semibold leading-6 text-stone-950">{presentPlanningProposal(application.proposal, "Proposal not recorded").display}</p>
                      <p className="mt-1 text-sm leading-6 text-stone-500">{application.location || application.local_authority}</p>
                    </Link>
                  )
                })}
              </ResultSection>
            </div>
          </>
        )}
      </section>
    </main>
  )
}

function ResultSection({ title, empty, children }: { title: string; empty: string; children: React.ReactNode }) {
  const hasChildren = Array.isArray(children) ? children.length > 0 : Boolean(children)
  return <section className="overflow-hidden rounded-2xl border border-stone-200 bg-white p-5 shadow-sm sm:p-6"><h2 className="text-2xl font-semibold tracking-tight text-stone-950">{title}</h2><div className="mt-4">{hasChildren ? children : <p className="border-t border-stone-200 py-5 text-sm text-stone-500">{empty}</p>}</div></section>
}

function SearchPath({ href, title, text }: { href: string; title: string; text: string }) {
  return <Link href={href} className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm transition hover:border-stone-400"><h2 className="text-xl font-semibold text-stone-950">{title}</h2><p className="mt-2 text-sm leading-6 text-stone-600">{text}</p></Link>
}
