import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import {
  formatPprCurrency,
  formatPprDate,
} from "@/lib/ppr"
import {
  formatPlanningDate,
  getPlanningApplication,
  getPlanningApplicationEvents,
} from "@/lib/planning"
import { getPlanningAuthorityBySlug } from "@/lib/planning-authorities"
import {
  planningApplicationPath,
  planningReferenceSlug,
} from "@/lib/property-intelligence"
import { getPlanningResearchContext } from "@/lib/property-research"
import {
  meaningfulPlanningValue,
  decisionDuePresentation,
  planningProposalSummary,
  planningProposalTitle,
  presentPlanningProposal,
} from "@/lib/planning-presentation"
import { getPublicSiteUrl } from "@/lib/site-url"
import { planningStatusLabel } from "@/lib/planning-status"
import { PlanningTimeline } from "@/components/PlanningTimeline"
import { DecisionDueRelativeText } from "@/components/DecisionDueRelativeText"

// Detail pages are generated on first visit and refreshed only by the bounded
// planning revalidation worker after their underlying record changes.
export const revalidate = false
export const dynamicParams = true

// Planning details are generated on demand, then retained until on-demand invalidation.
// Returning no build-time params avoids generating the full planning corpus at deploy time.
export function generateStaticParams() {
  return []
}

type Props = {
  params: Promise<{ authority: string; reference: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const resolved = await params
  const authority = getPlanningAuthorityBySlug(resolved.authority)
  if (!authority) return {}
  const application = await getPlanningApplication(authority, resolved.reference)
  if (!application) return {}
  const canonical = planningApplicationPath(authority, application.reference)
  const heading = planningProposalTitle(
    application.proposal,
    `Planning application ${application.reference}`
  )
  const summary = planningProposalSummary(
    application.proposal,
    `View planning application ${application.reference} from ${authority.name}.`
  )

  return {
    title: `${heading} | ${application.reference} | OpenList`,
    description: summary,
    alternates: { canonical },
    robots: { index: true, follow: true },
  }
}

export default async function PlanningApplicationPage({ params }: Props) {
  const resolved = await params
  const authority = getPlanningAuthorityBySlug(resolved.authority)
  if (!authority) notFound()
  const application = await getPlanningApplication(authority, resolved.reference)
  if (!application) notFound()
  const proposal = presentPlanningProposal(application.proposal)
  const fullProposal = meaningfulPlanningValue(application.proposal) ?? proposal.display
  const proposalTitle = planningProposalTitle(
    fullProposal,
    `Planning application ${application.reference}`
  )
  const sourceStatus = meaningfulPlanningValue(application.status)
  const currentStatus = planningStatusLabel(application.normalized_status)
  const decisionDue = decisionDuePresentation(application)

  const canonicalSlug = planningReferenceSlug(application.reference)
  if (resolved.reference !== canonicalSlug) notFound()

  const [research, timelineEvents] = await Promise.all([
    getPlanningResearchContext(application),
    getPlanningApplicationEvents(application.id),
  ])
  const canonicalPath = planningApplicationPath(authority, application.reference)
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: proposalTitle,
    url: `${getPublicSiteUrl()}${canonicalPath}`,
    description: fullProposal,
    dateModified: application.updated_at || undefined,
    about: {
      "@type": "GovernmentService",
      name: `${authority.name} planning application ${application.reference}`,
      provider: {
        "@type": "GovernmentOrganization",
        name: authority.name,
      },
    },
  }
  const soldPricePath =
    research.location.county && research.location.areaSlug
      ? `/sold-prices/${research.location.county.toLowerCase()}/${research.location.areaSlug}`
      : research.location.county
        ? `/sold-prices/${research.location.county.toLowerCase()}`
        : "/sold-prices"
  const researchLabel =
    research.location.locality ||
    research.location.eircode ||
    research.location.county ||
    authority.shortName
  const planningAreaFields = research.location.locality
    ? { area: research.location.locality }
    : null

  return (
    <main className="min-h-screen bg-stone-50">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }}
      />

      <section className="border-b border-stone-200 bg-white">
        <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 lg:py-14">
          <nav className="flex flex-wrap items-center gap-2 text-sm text-stone-500" aria-label="Breadcrumb">
            <Link href="/planning" className="transition hover:text-stone-900">Planning</Link>
            <span aria-hidden="true">/</span>
            <Link href={`/planning/${authority.slug}`} className="transition hover:text-stone-900">
              {authority.shortName}
            </Link>
            <span aria-hidden="true">/</span>
            <span className="font-medium text-stone-800">{application.reference}</span>
          </nav>

          <div className="mt-8 grid gap-7 lg:grid-cols-[minmax(0,1fr)_300px] lg:items-start">
            <div>
              <p className="font-mono text-sm font-semibold uppercase tracking-[0.16em] text-emerald-800">
                Planning application {application.reference}
              </p>
              <h1 className="mt-4 max-w-4xl text-3xl font-semibold leading-tight tracking-tight text-stone-950 sm:text-4xl">
                {proposalTitle}
              </h1>
              <p className="mt-5 max-w-3xl text-lg leading-8 text-stone-600">
                {application.location || "The source record does not include a location."}
              </p>
            </div>

            {currentStatus || application.source_url ? (
            <div className="rounded-2xl border border-stone-200 bg-stone-50 p-5">
              {currentStatus ? (
                <>
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-500">Current status</p>
                  <p className="mt-3 text-2xl font-semibold tracking-tight text-stone-950">
                    {currentStatus}
                  </p>
                  {sourceStatus && sourceStatus !== currentStatus ? (
                    <p className="mt-2 text-xs leading-5 text-stone-500">
                      Council status: {sourceStatus}
                    </p>
                  ) : null}
                </>
              ) : null}
              {decisionDue ? (
                <div className={`${currentStatus ? "mt-5 border-t border-stone-200 pt-5" : ""}`}>
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-500">
                    Decision due
                  </p>
                  <time
                    dateTime={decisionDue.date}
                    className="mt-2 block text-lg font-semibold tracking-tight text-stone-950"
                  >
                    {decisionDue.formattedDate}
                  </time>
                  <DecisionDueRelativeText date={decisionDue.date} />
                </div>
              ) : null}
              {application.source_url ? (
                <a
                  href={application.source_url}
                  target="_blank"
                  rel="noreferrer"
                  className={`${currentStatus || decisionDue ? "mt-5" : ""} inline-flex min-h-11 w-full items-center justify-center rounded-lg bg-stone-950 px-4 text-center text-sm font-semibold text-white transition hover:bg-stone-700`}
                >
                  View official council application
                </a>
              ) : (
                <p className="mt-4 text-sm leading-6 text-stone-500">
                  An official council link is not available for this recorded application.
                </p>
              )}
            </div>
            ) : null}
          </div>
        </div>
      </section>

      <section className="mx-auto grid max-w-6xl gap-8 px-4 py-10 sm:px-6 lg:grid-cols-[minmax(0,1fr)_360px] lg:py-14">
        <div className="min-w-0 space-y-8">
          <section className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm sm:p-8">
            <h2 className="text-2xl font-semibold tracking-tight text-stone-950">Application details</h2>
            <dl className="mt-6 grid gap-x-8 gap-y-6 sm:grid-cols-2">
              <Detail label="Planning reference" value={application.reference} mono />
              <Detail label="Council" value={application.local_authority} />
              <ProposalDescription
                value={fullProposal}
                isLikelyTruncated={proposal.isLikelyTruncated}
              />
              <Detail label="Location / address" value={application.location} />
              <Detail label="Applicant" value={application.applicant_name} />
              <Detail label="Agent" value={application.agent_name} />
              <Detail label="Application type" value={application.application_type} />
              <Detail label="Received / registered" value={formatPlanningDate(application.registration_date)} />
              <Detail label="Valid date" value={formatPlanningDate(application.valid_date)} />
              <Detail label="OpenList status" value={currentStatus} />
              <Detail label="Council status" value={application.status} />
              <Detail label="Decision" value={application.decision_text} />
              <Detail label="Decision date" value={formatPlanningDate(application.decision_date)} />
              <Detail label="Final grant date" value={formatPlanningDate(application.final_grant_date)} />
              <Detail label="Appeal lodged" value={formatPlanningDate(application.appeal_lodged_date)} />
              <Detail label="Appeal decision date" value={formatPlanningDate(application.appeal_decision_date)} />
              <Detail label="Ward / district" value={application.ward} />
              <Detail label="Grid reference" value={application.grid_reference} />
            </dl>
          </section>

          <PlanningTimeline events={timelineEvents} />

          {research.coordinates ? (
            <section className="overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm">
              <div className="p-6 sm:p-8">
                <h2 className="text-2xl font-semibold tracking-tight text-stone-950">Application location</h2>
                <p className="mt-2 text-sm leading-6 text-stone-600">
                  Approximate map position from coordinates supplied with the planning record.
                </p>
              </div>
              <iframe
                title={`Map for planning application ${application.reference}`}
                loading="lazy"
                className="h-[360px] w-full border-0"
                src={openStreetMapEmbedUrl(research.coordinates)}
              />
            </section>
          ) : null}

          <section className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm sm:p-8">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-800">Location context</p>
                <h2 className="mt-2 text-2xl font-semibold tracking-tight text-stone-950">Nearby sold prices</h2>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-stone-600">
                  {nearbySalesExplanation(research.nearbySales[0]?.matchKind, research.location.locality)}
                </p>
              </div>
              <Link href={soldPricePath} className="shrink-0 text-sm font-semibold text-stone-700 transition hover:text-stone-950">
                Explore sold prices <span aria-hidden="true">→</span>
              </Link>
            </div>

            {research.nearbySales.length > 0 ? (
              <div className="mt-6 divide-y divide-stone-200 border-y border-stone-200">
                {research.nearbySales.map((sale) => (
                  <Link
                    key={sale.id}
                    href={soldPricePath}
                    className="grid gap-3 py-5 transition hover:bg-stone-50 sm:grid-cols-[150px_minmax(0,1fr)_130px] sm:items-center sm:px-3"
                  >
                    <p className="text-xl font-semibold text-stone-950">{formatPprCurrency(sale.price_eur)}</p>
                    <div className="min-w-0">
                      <p className="font-medium leading-6 text-stone-900">{sale.address_raw}</p>
                      <p className="mt-1 text-sm text-stone-500">Sold {formatPprDate(sale.date_of_sale)}</p>
                    </div>
                    <p className="text-sm text-stone-500 sm:text-right">
                      {sale.distanceKm === null ? "Locality match" : `${formatDistance(sale.distanceKm)} away`}
                    </p>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="mt-6 rounded-xl bg-stone-50 p-6 text-sm leading-6 text-stone-600">
                No reliable nearby sold-price match is available for this record. OpenList does not infer an exact property match from an address alone.
              </div>
            )}
          </section>
        </div>

        <aside className="space-y-5">
          <div className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold tracking-tight text-stone-950">About this record</h2>
            <p className="mt-3 text-sm leading-6 text-stone-600">
              OpenList adds search and local market context. {authority.name} remains the authoritative source for this application.
            </p>
            <dl className="mt-5 space-y-4 border-t border-stone-200 pt-5 text-sm">
              <Detail label="OpenList last updated" value={formatTimestamp(application.updated_at)} />
              <Detail label="Location match" value={formatMatchKind(research.location.matchKind)} />
            </dl>
          </div>

          <div className="rounded-2xl border border-stone-200 bg-stone-950 p-6 text-white shadow-sm">
            <p className="text-sm font-semibold text-stone-300">Research this area</p>
            <p className="mt-2 text-xl font-semibold">Explore {researchLabel}</p>
            <p className="mt-3 text-sm leading-6 text-stone-300">
              {researchAreaExplanation(
                research.location.matchKind,
                researchLabel,
                research.location.eircode
              )}
            </p>
            <div className="mt-5 divide-y divide-stone-700 border-y border-stone-700">
              <ResearchLink href={soldPricePath}>Sold prices in {researchLabel}</ResearchLink>
              {planningAreaFields ? (
                <ResearchForm
                  action={`/planning/${authority.slug}`}
                  fields={planningAreaFields}
                >
                  Planning applications in {researchLabel}
                </ResearchForm>
              ) : (
                <ResearchLink href={`/planning/${authority.slug}`}>
                  Planning applications in {researchLabel}
                </ResearchLink>
              )}
              <ResearchForm action="/search" fields={{ q: researchLabel }}>
                Search all OpenList results
              </ResearchForm>
            </div>
          </div>
        </aside>
      </section>
    </main>
  )
}

function Detail({ label, value, mono = false }: { label: string; value: string | null | undefined; mono?: boolean }) {
  const shownValue = meaningfulPlanningValue(value)
  if (!shownValue) return null
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-[0.14em] text-stone-500">{label}</dt>
      <dd className={`mt-2 break-words text-sm leading-6 text-stone-900 ${mono ? "font-mono font-semibold" : ""}`}>
        {shownValue}
      </dd>
    </div>
  )
}

function ProposalDescription({
  value,
  isLikelyTruncated,
}: {
  value: string
  isLikelyTruncated: boolean
}) {
  return (
    <div className="sm:col-span-2">
      <dt className="text-xs font-semibold uppercase tracking-[0.14em] text-stone-500">
        Proposal description
      </dt>
      <dd className="mt-2 break-words text-sm leading-7 text-stone-900">
        {value}
      </dd>
      {isLikelyTruncated ? (
        <p className="mt-2 text-xs leading-5 text-stone-500">
          The proposal text available to OpenList may be incomplete. Check the official application record for full details.
        </p>
      ) : null}
    </div>
  )
}

function formatTimestamp(value: string | null) {
  if (!value) return "Not recorded"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "Not recorded"
  return new Intl.DateTimeFormat("en-IE", { day: "numeric", month: "short", year: "numeric" }).format(date)
}

function formatDistance(distanceKm: number) {
  return distanceKm < 1 ? `${Math.round(distanceKm * 1000)} m` : `${distanceKm.toFixed(1)} km`
}

function formatMatchKind(kind: "eircode" | "locality" | "county" | "none") {
  if (kind === "eircode") return "Eircode context"
  if (kind === "locality") return "Locality context"
  if (kind === "county") return "County context only"
  return "No reliable location match"
}

function researchAreaExplanation(
  kind: "eircode" | "locality" | "county" | "none",
  label: string,
  eircode: string | null
) {
  if (kind === "eircode") return `The published Eircode${eircode ? ` (${eircode})` : ""} establishes locality context for ${label}.`
  if (kind === "locality") return `Links use the locality matched in the published application address: ${label}.`
  if (kind === "county") return `Only county-level context could be established reliably for this application: ${label}.`
  return `No more specific place match was available, so planning links stay within ${label}.`
}

function ResearchLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="flex min-h-12 items-center justify-between gap-3 py-3 text-sm font-semibold text-white transition hover:text-emerald-300"
    >
      <span>{children}</span>
      <span aria-hidden="true">→</span>
    </Link>
  )
}

function ResearchForm({
  action,
  fields,
  children,
}: {
  action: string
  fields: Record<string, string>
  children: React.ReactNode
}) {
  return (
    <form action={action} method="get">
      {Object.entries(fields).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      <button
        type="submit"
        className="flex min-h-12 w-full items-center justify-between gap-3 py-3 text-left text-sm font-semibold text-white transition hover:text-emerald-300"
      >
        <span>{children}</span>
        <span aria-hidden="true">→</span>
      </button>
    </form>
  )
}

function nearbySalesExplanation(kind: "proximity" | "eircode" | "locality" | undefined, locality: string | null) {
  if (kind === "proximity") return "Recent Property Price Register sales within 15 km, ordered by distance. These are nearby records, not confirmed matches to the same property."
  if (kind === "eircode") return "Recent Property Price Register sales sharing the published Eircode. This is location context, not confirmation that the records concern the same property."
  if (kind === "locality") return `Recent Property Price Register sales in ${locality || "the matched locality"}. Distances are not shown because the sale records do not contain reliable coordinates.`
  return "OpenList shows sold-price context only where a reliable proximity, Eircode or locality relationship can be established."
}

function openStreetMapEmbedUrl({ lat, lng }: { lat: number; lng: number }) {
  const radius = 0.012
  const bbox = [lng - radius, lat - radius, lng + radius, lat + radius].join(",")
  return `https://www.openstreetmap.org/export/embed.html?bbox=${encodeURIComponent(bbox)}&layer=mapnik&marker=${encodeURIComponent(`${lat},${lng}`)}`
}
