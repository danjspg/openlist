import type { Metadata } from "next"
import Link from "next/link"

export const metadata: Metadata = {
  title: "Data Sources & Licensing | OpenList",
  description:
    "Official data sources, attribution, licensing and reuse information for planning, sold-price and mapping data used by OpenList.",
  alternates: {
    canonical: "/data-sources",
  },
}

const externalLinkClass =
  "font-medium text-emerald-800 underline decoration-emerald-300 underline-offset-4 transition hover:text-emerald-950"

export default function DataSourcesPage() {
  return (
    <main className="min-h-screen bg-white">
      <section className="mx-auto max-w-5xl px-6 py-10 sm:py-14">
        <div className="max-w-3xl">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-emerald-800">
            OpenList data
          </p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-stone-950 sm:text-4xl">
            Data sources &amp; licensing
          </h1>
          <p className="mt-5 text-base leading-7 text-stone-600 sm:text-lg sm:leading-8">
            OpenList reorganises public information to make Irish planning and property data easier to search, follow and understand. This page records the principal sources we use, the relevant reuse terms we have identified, and how OpenList attributes those sources.
          </p>
          <p className="mt-3 text-sm leading-6 text-stone-500">
            Last reviewed: 25 August 2026.
          </p>
        </div>

        <div className="mt-10 space-y-7">
          <SourceSection title="Planning applications">
            <p>
              OpenList uses public Irish planning-register information, including the National Planning Application Database and public information made available by individual planning authorities. OpenList may standardise fields, normalise lifecycle statuses, combine records and derive source-backed timeline events, while retaining links to official records where available.
            </p>
            <p>
              The National Planning Application Database is published by the Department of Housing, Local Government and Heritage on Ireland&apos;s Open Data Portal under the Creative Commons Attribution 4.0 International licence (CC BY 4.0).
            </p>
            <p className="rounded-xl border border-stone-200 bg-stone-50 p-4 text-stone-700">
              Contains Irish Public Sector Information licensed under a Creative Commons Attribution 4.0 International (CC BY 4.0) licence.
            </p>
            <p>
              Ireland&apos;s standard Public Sector Information licence permits copying, adaptation, publication, distribution and commercial reuse, subject to conditions including source acknowledgement. Where an individual information provider specifies a different or more restrictive licence for particular material, those specific terms take precedence for that material.
            </p>
            <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
              <a
                href="https://data.gov.ie/dataset/national-planning-applications"
                target="_blank"
                rel="noreferrer"
                className={externalLinkClass}
              >
                National Planning Applications dataset
              </a>
              <a
                href="https://creativecommons.org/licenses/by/4.0/"
                target="_blank"
                rel="noreferrer"
                className={externalLinkClass}
              >
                CC BY 4.0 licence
              </a>
              <a
                href="https://circulars.gov.ie/pdf/circular/per/2016/12.pdf"
                target="_blank"
                rel="noreferrer"
                className={externalLinkClass}
              >
                Irish PSI licence
              </a>
            </div>
          </SourceSection>

          <SourceSection title="Residential sold prices">
            <p>
              OpenList uses residential sale information published through the Residential Property Price Register maintained by the Property Services Regulatory Authority (PSRA). The register contains sale date, price and address information for residential properties, based on information declared to the Revenue Commissioners for stamp-duty purposes.
            </p>
            <p>
              The PSRA states that information on its website may be reused free of charge in any format, subject to its reuse conditions. Those conditions include acknowledging the PSRA as source and copyright owner when information is supplied to others, reproducing the information accurately, and not using it in a misleading way.
            </p>
            <p className="rounded-xl border border-stone-200 bg-stone-50 p-4 text-stone-700">
              Residential Property Price Register information: source and copyright © Property Services Regulatory Authority (PSRA), reused under the PSRA&apos;s published Public Sector Information reuse terms.
            </p>
            <p>
              OpenList does not claim ownership of the underlying PSRA information. OpenList&apos;s own search, presentation, normalisation and derived analysis are separate from the source register.
            </p>
            <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
              <a
                href="https://www.psr.ie/psra-registers/"
                target="_blank"
                rel="noreferrer"
                className={externalLinkClass}
              >
                PSRA public registers
              </a>
              <a
                href="https://www.psr.ie/re-use-of-public-sector-information/"
                target="_blank"
                rel="noreferrer"
                className={externalLinkClass}
              >
                PSRA reuse terms
              </a>
            </div>
          </SourceSection>

          <SourceSection title="Maps">
            <p>
              Where OpenList displays an OpenStreetMap map, map data is provided by OpenStreetMap contributors. OpenStreetMap data is available under the Open Data Commons Open Database Licence (ODbL). Map attribution is also shown on the map itself where supplied by the embedded map service.
            </p>
            <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
              <a
                href="https://www.openstreetmap.org/copyright"
                target="_blank"
                rel="noreferrer"
                className={externalLinkClass}
              >
                © OpenStreetMap contributors
              </a>
            </div>
          </SourceSection>

          <SourceSection title="What OpenList changes">
            <p>
              OpenList does not simply republish source pages. We clean and standardise data for search, reconcile fields across authorities, classify planning lifecycle states, connect planning and sold-price context, and may calculate or derive presentation fields from the underlying records. A derived or normalised OpenList value can therefore differ in wording from the source record even where it represents the same underlying information.
            </p>
            <p>
              We aim to distinguish source facts from OpenList-derived presentation and to avoid implying endorsement by any public authority. Government and local-authority names are used to identify the source of public records; official crests, logos and branding are not used to imply affiliation.
            </p>
          </SourceSection>

          <SourceSection title="Accuracy and authoritative records">
            <p>
              Public datasets can contain omissions, delays, inconsistent status wording and other errors. OpenList can also make mistakes when importing, matching or normalising information. The relevant planning authority remains the authoritative source for a planning application, and the PSRA remains the authoritative publisher of the Residential Property Price Register.
            </p>
            <p>
              If information matters to a planning, property, legal or financial decision, check the official source before relying on it. OpenList is an independent service and is not affiliated with, sponsored by or endorsed by the Department of Housing, Local Government and Heritage, any local authority, the PSRA or OpenStreetMap.
            </p>
          </SourceSection>

          <SourceSection title="Corrections, rights and source questions">
            <p>
              If you believe OpenList is attributing a source incorrectly, reproducing information outside the applicable reuse terms, or displaying an inaccurate derived value, please let us know so it can be reviewed. Third-party rights, personal information and material that a public body is not authorised to license are not automatically covered by public-sector reuse licences.
            </p>
            <p>
              For information about how OpenList handles personal data, see our{" "}
              <Link href="/privacy" className={externalLinkClass}>
                Privacy Notice
              </Link>
              . General limitations on use of the service are set out in our{" "}
              <Link href="/terms" className={externalLinkClass}>
                Terms
              </Link>
              .
            </p>
          </SourceSection>
        </div>
      </section>
    </main>
  )
}

function SourceSection({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <section className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm sm:p-8">
      <h2 className="text-xl font-semibold tracking-tight text-stone-950 sm:text-2xl">{title}</h2>
      <div className="mt-4 space-y-4 text-sm leading-7 text-stone-600 sm:text-base">
        {children}
      </div>
    </section>
  )
}
