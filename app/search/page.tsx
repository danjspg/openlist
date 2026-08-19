import type { Metadata } from "next"
import Link from "next/link"
import { connection } from "next/server"
import { areaNameFromSlug, formatPprCurrency, formatPprDate } from "@/lib/ppr"
import { formatPlanningDate } from "@/lib/planning"
import { getPlanningAuthorityByCode } from "@/lib/planning-authorities"
import { planningApplicationPath } from "@/lib/property-intelligence"
import { planningProposalTitle } from "@/lib/planning-presentation"
import {
  searchPropertyIntelligence,
  type UnifiedSearchResults,
} from "@/lib/unified-search"

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
    : {
        places: [],
        addresses: [],
        planningApplications: [],
        intent: "area" as const,
        eircode: null,
        locationContext: null,
        nearbySales: [],
        nearbyPlanningApplications: [],
        localMarket: null,
        dataUnavailable: false,
      }
  const resultCount =
    results.places.length + results.addresses.length + results.planningApplications.length
  const hasPlaces = results.places.length > 0
  const hasAddresses = results.addresses.length > 0
  const hasPlanning = results.planningApplications.length > 0
  const hasResults = resultCount > 0
  const isEircodeSearch = results.intent === "eircode"
  const isInvalidEircode = results.intent === "invalid-eircode"
  const resultLabel = results.eircode ?? query

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
          isInvalidEircode ? (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm leading-6 text-amber-950">
              <p className="font-semibold">Invalid Eircode format</p>
              <p className="mt-1">Enter a seven-character Eircode such as A65 F4E2 or A65F4E2.</p>
            </div>
          ) : isEircodeSearch ? (
            <EircodeResults results={results} label={resultLabel} />
          ) : (
            <div>
              <p className="text-sm text-stone-500">
                {resultCount} result{resultCount === 1 ? "" : "s"} for “{query}”
              </p>
              {hasResults ? (
                <div className="mt-6 space-y-8">
                  {hasPlaces ? (
                    <ResultSection title="Places" empty="No matching places found.">
                      {results.places.map((place) => (
                        <Link key={`${place.county}-${place.areaSlug}`} href={`/sold-prices/${place.county.toLowerCase()}/${place.areaSlug}`} className="block border-t border-stone-200 px-1 py-4 transition hover:bg-stone-50 sm:px-3">
                          <p className="font-semibold text-stone-950">{place.areaLabel}, {place.county}</p>
                          <p className="mt-1 text-sm text-stone-500">{place.salesCount.toLocaleString("en-IE")} recorded sales · Research this area</p>
                        </Link>
                      ))}
                    </ResultSection>
                  ) : null}
                  {hasAddresses ? (
                    <ResultSection
                      title={results.intent === "area" ? "Recent sold prices" : "Properties / addresses"}
                      empty={results.intent === "area" ? "No sold-price records were found for this exact area." : "No matching property addresses found."}
                    >
                      {results.addresses.map((sale) => <SaleRow key={sale.id} sale={sale} />)}
                    </ResultSection>
                  ) : null}
                  {hasPlanning ? (
                    <ResultSection title="Planning applications" empty="No matching planning applications found.">
                      {results.planningApplications.map((application) => <PlanningRow key={application.id} application={application} />)}
                    </ResultSection>
                  ) : null}
                </div>
              ) : (
                <div className="mt-6 rounded-2xl border border-stone-200 bg-white px-5 py-5 text-sm leading-6 text-stone-600 shadow-sm sm:px-6">
                  <p className="font-semibold text-stone-950">No results found for “{query}”</p>
                  <p className="mt-1">Try an address, area, Eircode, planning reference, applicant or proposal keyword.</p>
                </div>
              )}
            </div>
          )
        )}
      </section>
    </main>
  )
}

function EircodeResults({
  results,
  label,
}: {
  results: UnifiedSearchResults
  label: string
}) {
  const exactCount = results.addresses.length + results.planningApplications.length
  const context = results.locationContext
  const hasCoordinates = Boolean(
    context && context.lat !== null && context.lng !== null
  )
  const market = results.localMarket
  const areaLabel = market?.label ?? (market?.areaSlug
    ? areaNameFromSlug(market.areaSlug)
    : market?.locality ?? market?.county ?? null)

  return (
    <div>
      <p className="text-sm font-medium text-stone-600">Results for {label}</p>
      {results.dataUnavailable ? (
        <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm leading-6 text-amber-950">
          <p className="font-semibold">Property data temporarily unavailable</p>
          <p className="mt-1">OpenList could not complete the exact and local lookup. Try this Eircode again shortly.</p>
        </div>
      ) : null}
      {results.dataUnavailable ? null : (
        <>
      {exactCount === 0 ? (
        <p className="mt-2 text-sm leading-6 text-stone-500">
          No exact sold-price or planning record was found.
          {context?.source === "routing-key"
            ? ` Showing available context from the broader ${label.slice(0, 3)} routing area.`
            : null}
        </p>
      ) : null}
      {context?.conflict ? (
        <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm leading-6 text-amber-950">
          {context.conflict}
        </div>
      ) : null}

      <div className="mt-8 space-y-8">
        {exactCount > 0 ? (
          <div>
            <h2 className="text-2xl font-semibold tracking-tight text-stone-950">Exact matches</h2>
          <div className="mt-4 grid gap-6 lg:grid-cols-2">
            <ResultSection title="Exact sold-price records" empty="No exact sold-price record was found for this Eircode.">
              {results.addresses.map((sale) => <SaleRow key={sale.id} sale={sale} badge="Exact Eircode" />)}
            </ResultSection>
            <ResultSection title="Exact planning records" empty="No exact planning record was found for this Eircode.">
              {results.planningApplications.map((application) => <PlanningRow key={application.id} application={application} badge="Exact Eircode" />)}
            </ResultSection>
          </div>
          </div>
        ) : null}

        {hasCoordinates ? (
          <div>
            <h2 className="text-2xl font-semibold tracking-tight text-stone-950">Around this location</h2>
            <p className="mt-2 text-sm leading-6 text-stone-600">
              Distance-ranked records are within 2 km of a coordinate supplied by an exact OpenList source. They are contextual records, not exact property matches.
            </p>
            <div className="mt-4 grid gap-6 lg:grid-cols-2">
              <ResultSection title="Nearby sold prices" empty="No coordinate-bearing sold-price records were available within 2 km.">
                {results.nearbySales.map((sale) => <SaleRow key={sale.id} sale={sale} distanceKm={sale.distanceKm} />)}
              </ResultSection>
              <ResultSection title="Planning applications near this location" empty="No planning applications with usable coordinates were found within 2 km.">
                {results.nearbyPlanningApplications.map((application) => <PlanningRow key={application.id} application={application} distanceKm={application.distanceKm} />)}
              </ResultSection>
            </div>
          </div>
        ) : null}

        {context?.source === "routing-key" && context.routingMarkets.length > 1 ? (
          <div>
            <h2 className="text-2xl font-semibold tracking-tight text-stone-950">Markets in this routing area</h2>
            <p className="mt-2 text-sm leading-6 text-stone-600">
              Routing key {label.slice(0, 3)} spans several named markets. Without an exact source record, OpenList cannot safely choose one of them for this Eircode.
            </p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {context.routingMarkets.map((routingMarket) => (
                <div key={`${routingMarket.county}-${routingMarket.areaSlug}`} className="rounded-2xl border border-stone-200 bg-white px-5 py-4 shadow-sm">
                  <p className="font-semibold text-stone-950">{routingMarket.label}</p>
                  <p className="mt-1 text-sm text-stone-500">{routingMarket.county}</p>
                  <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-sm font-semibold">
                    <Link href={`/sold-prices/${routingMarket.county.toLowerCase()}/${routingMarket.areaSlug}`} className="text-emerald-800 underline decoration-emerald-300 underline-offset-4 hover:text-emerald-950">
                      Sold prices
                    </Link>
                    <Link href={`/planning?area=${encodeURIComponent(routingMarket.locality)}`} className="text-emerald-800 underline decoration-emerald-300 underline-offset-4 hover:text-emerald-950">
                      Planning
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {market ? (
          <div>
            <h2 className="text-2xl font-semibold tracking-tight text-stone-950">
              {market.level === "routing-area" && areaLabel
                ? `${areaLabel} area`
                : market.level === "routing-area"
                  ? "Routing-area context"
                  : "Local market"}
            </h2>
            <p className="mt-2 text-sm leading-6 text-stone-600">
              {market.level === "routing-area"
                ? `Broader market context for routing key ${market.routingKey}. These records are not distance-ranked or presented as nearby.`
                : `Area-level context for ${areaLabel ?? market.county}; it is separate from exact Eircode matches.`}
            </p>
            {market.stats ? (
              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                <MarketStat label="Recorded sales" value={Number(market.stats.sales_count ?? 0).toLocaleString("en-IE")} />
                <MarketStat label="Median sold price" value={formatPprCurrency(market.stats.median_price_eur)} />
                <MarketStat label="Latest recorded sale" value={formatPprDate(market.stats.last_sale_date)} />
              </div>
            ) : null}
            {market.areaSlug && market.salesBasis === "area" ? (
              <Link href={`/sold-prices/${market.county.toLowerCase()}/${market.areaSlug}`} className="mt-4 inline-flex text-sm font-semibold text-emerald-800 underline decoration-emerald-300 underline-offset-4 hover:text-emerald-950">
                View full {areaNameFromSlug(market.areaSlug)} sold-price data
              </Link>
            ) : null}
            <div className="mt-5 grid gap-6 lg:grid-cols-2">
              {market.recentSales.length > 0 ? (
                <ResultSection
                  title={market.salesBasis === "routing-key"
                    ? `Recent sold prices for ${areaLabel} (${market.routingKey})`
                    : `Recent sold prices in ${areaLabel}`}
                  empty="No recent area sales found."
                >
                  {market.recentSales.map((sale) => <SaleRow key={sale.id} sale={sale} />)}
                </ResultSection>
              ) : null}
              <ResultSection
                title={market.planningBasis === "routing-key"
                  ? `Planning applications for ${areaLabel} (${market.routingKey})`
                  : market.areaSlug
                    ? `Recent planning applications in ${areaLabel}`
                    : `Planning activity for ${market.county}`}
                empty="No recent planning applications were found for this area."
              >
                {market.planningApplications.map((application) => <PlanningRow key={application.id} application={application} />)}
              </ResultSection>
            </div>
          </div>
        ) : null}

        {context?.contextLevel === "unresolved" ? (
          <div className="rounded-2xl border border-stone-200 bg-white px-5 py-5 text-sm leading-6 text-stone-600 shadow-sm">
            <p className="font-semibold text-stone-950">No local context available</p>
            <p className="mt-1">OpenList does not currently have enough source data to locate this Eircode precisely.</p>
          </div>
        ) : null}
      </div>
        </>
      )}
    </div>
  )
}

type SearchSale = UnifiedSearchResults["addresses"][number]
type SearchPlanningApplication = UnifiedSearchResults["planningApplications"][number]

function SaleRow({
  sale,
  badge,
  distanceKm,
}: {
  sale: SearchSale
  badge?: string
  distanceKm?: number
}) {
  return (
    <Link href={sale.county && sale.area_slug ? `/sold-prices/${sale.county.toLowerCase()}/${sale.area_slug}` : "/sold-prices"} className="grid gap-2 border-t border-stone-200 px-1 py-4 transition hover:bg-stone-50 sm:grid-cols-[minmax(0,1fr)_140px] sm:px-3">
      <div>
        {badge ? <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-emerald-800">{badge}</p> : null}
        <p className="font-semibold text-stone-950">{sale.address_raw}</p>
        <p className="mt-1 text-sm text-stone-500">{sale.locality || (sale.area_slug ? areaNameFromSlug(sale.area_slug) : sale.county)} · Sold {formatPprDate(sale.date_of_sale)}</p>
      </div>
      <div className="sm:text-right">
        <p className="font-semibold text-stone-900">{formatPprCurrency(sale.price_eur)}</p>
        {distanceKm !== undefined ? <p className="mt-1 text-xs text-stone-500">{formatDistance(distanceKm)} away</p> : null}
      </div>
    </Link>
  )
}

function PlanningRow({
  application,
  badge,
  distanceKm,
}: {
  application: SearchPlanningApplication
  badge?: string
  distanceKm?: number
}) {
  const authority = getPlanningAuthorityByCode(application.local_authority_code)
  const href = authority ? planningApplicationPath(authority, application.reference) : "/planning"
  return (
    <Link href={href} className="block border-t border-stone-200 px-1 py-4 transition hover:bg-stone-50 sm:px-3">
      {badge ? <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-emerald-800">{badge}</p> : null}
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="font-mono text-sm font-semibold text-emerald-800">{application.reference}</p>
        <p className="text-sm text-stone-500">{formatPlanningDate(application.registration_date)}</p>
      </div>
      <p className="mt-2 line-clamp-3 font-semibold leading-6 text-stone-950">{planningProposalTitle(application.proposal, "Proposal not recorded")}</p>
      <p className="mt-1 text-sm leading-6 text-stone-500">{application.location || application.local_authority}</p>
      {distanceKm !== undefined ? <p className="mt-1 text-xs font-medium text-stone-500">{formatDistance(distanceKm)} away</p> : null}
    </Link>
  )
}

function MarketStat({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl border border-stone-200 bg-white px-4 py-3 shadow-sm"><p className="text-xs font-medium uppercase tracking-wide text-stone-500">{label}</p><p className="mt-1 font-semibold text-stone-950">{value}</p></div>
}

function formatDistance(distanceKm: number) {
  return distanceKm < 1 ? `${Math.round(distanceKm * 1_000)} m` : `${distanceKm.toFixed(1)} km`
}

function ResultSection({ title, empty, children }: { title: string; empty: string; children: React.ReactNode }) {
  const hasChildren = Array.isArray(children) ? children.length > 0 : Boolean(children)
  return <section className="overflow-hidden rounded-2xl border border-stone-200 bg-white p-5 shadow-sm sm:p-6"><h2 className="text-2xl font-semibold tracking-tight text-stone-950">{title}</h2><div className="mt-4">{hasChildren ? children : <p className="border-t border-stone-200 py-5 text-sm text-stone-500">{empty}</p>}</div></section>
}

function SearchPath({ href, title, text }: { href: string; title: string; text: string }) {
  return <Link href={href} className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm transition hover:border-stone-400"><h2 className="text-xl font-semibold text-stone-950">{title}</h2><p className="mt-2 text-sm leading-6 text-stone-600">{text}</p></Link>
}
