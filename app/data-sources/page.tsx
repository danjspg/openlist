import type { Metadata } from "next"
import Link from "next/link"

export const metadata: Metadata = {
  title: "Data Sources & Licensing | OpenList",
  description:
    "Official data sources, attribution, licensing and reuse information for planning, appeals, construction, sold-price and mapping data used by OpenList.",
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
            Last reviewed: 26 August 2026.
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
              <a href="https://data.gov.ie/dataset/national-planning-applications" target="_blank" rel="noreferrer" className={externalLinkClass}>
                National Planning Applications dataset
              </a>
              <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noreferrer" className={externalLinkClass}>
                CC BY 4.0 licence
              </a>
              <a href="https://circulars.gov.ie/pdf/circular/per/2016/12.pdf" target="_blank" rel="noreferrer" className={externalLinkClass}>
                Irish PSI licence
              </a>
            </div>
          </SourceSection>

          <SourceSection title="Direct planning-register sources">
            <p>
              To keep active applications and lifecycle information current, OpenList also reads selected public planning-register pages and official council search services directly. These sources supplement the national dataset; the relevant local authority remains the publisher and authoritative source of the planning record.
            </p>
            <p>
              OpenList uses the LGMA ePlan service for participating authorities including Carlow, Cavan, Clare, Donegal, Galway County, Galway City, Kildare, Kilkenny, Kerry, Laois, Limerick, Leitrim, Longford, Louth, Mayo, Meath, Monaghan, Waterford, Offaly, Roscommon, Sligo, Tipperary, Westmeath and Wicklow. ePlan identifies itself as a service provided by the Local Government Management Agency (LGMA) on behalf of local authorities.
            </p>
            <p className="rounded-xl border border-stone-200 bg-stone-50 p-4 text-stone-700">
              ePlan planning-register information: source © the relevant participating local authority; ePlan service provided by the Local Government Management Agency (LGMA). Reused subject to applicable public-sector information terms and other applicable law.
            </p>
            <p>
              OpenList also uses official public planning-search services operated for Kildare County Council and the Citizens Portal / Agile planning systems used by Cork County Council, Cork City Council and Wexford County Council. Where a technology supplier operates a portal, OpenList attributes the underlying planning information to the relevant council rather than treating the supplier as the owner of the council&apos;s planning register.
            </p>
            <p>
              Council PSI policies commonly distinguish reusable public-sector information from material that is merely displayed for statutory public inspection. OpenList therefore treats its direct-source reuse as applying to planning-register metadata such as references, proposals, locations, statuses, dates and decision outcomes. We do not rely on that general permission to republish applicant-uploaded drawings, plans, reports, photographs, maps, submissions or other third-party material.
            </p>
            <p>
              Personal data appearing in a statutory planning register is not treated as automatically open licensed merely because it is publicly visible. Its handling is governed separately by applicable data-protection law and OpenList&apos;s Privacy Notice. OpenList does not use planning-register personal data for direct marketing.
            </p>
            <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
              <a href="https://www.lgma.ie/en/publications/corporate/reuse-of-public-sector-information.pdf" target="_blank" rel="noreferrer" className={externalLinkClass}>
                LGMA PSI policy
              </a>
              <a href="https://www.eplanning.ie" target="_blank" rel="noreferrer" className={externalLinkClass}>
                ePlan
              </a>
              <a href="https://webgeo.kildarecoco.ie/planningenquiry" target="_blank" rel="noreferrer" className={externalLinkClass}>
                Kildare planning enquiry
              </a>
            </div>
          </SourceSection>

          <SourceSection title="Planning appeals">
            <p>
              OpenList uses the official An Coimisiún Pleanála Cases 2016 onwards dataset to add appeal-case information where a reliable link can be established to a local-authority planning application. The structured source includes case number, development description and address, date received, decision status, decision date, planning authority and an official case link.
            </p>
            <p>
              The dataset is published by An Coimisiún Pleanála on Ireland&apos;s Open Data Portal under the Creative Commons Attribution 4.0 International licence (CC BY 4.0), with a published weekly update frequency. OpenList supplements the structured dataset with the official An Coimisiún Pleanála case page solely to obtain case metadata needed for a safe link back to the planning-authority record, such as the Planning Authority Case Reference and case type.
            </p>
            <p className="rounded-xl border border-stone-200 bg-stone-50 p-4 text-stone-700">
              Appeal-case information: source An Coimisiún Pleanála, licensed under Creative Commons Attribution 4.0 International (CC BY 4.0). Matching an appeal case to a local-authority planning application is OpenList processing.
            </p>
            <p>
              OpenList only treats an appeal link as high-confidence where the official case page identifies a planning-authority case reference and that reference can be matched uniquely within the stated planning authority. We do not infer an appeal link from address similarity alone.
            </p>
            <p>
              An Coimisiún Pleanála notes that the open dataset is not exhaustive: invalid and withdrawn cases may be omitted, cases may appear after a delay, and its website should be consulted for the most up-to-date case information. Absence of a case from OpenList therefore does not establish that no appeal exists.
            </p>
            <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
              <a href="https://data.gov.ie/dataset/cases-2016-onwards-received-or-decided-by-an-bord-pleanala-on-or-after-1st-january-2016" target="_blank" rel="noreferrer" className={externalLinkClass}>
                An Coimisiún Pleanála cases dataset
              </a>
              <a href="https://www.pleanala.ie" target="_blank" rel="noreferrer" className={externalLinkClass}>
                An Coimisiún Pleanála
              </a>
              <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noreferrer" className={externalLinkClass}>
                CC BY 4.0 licence
              </a>
            </div>
          </SourceSection>

          <SourceSection title="Construction commencement &amp; completion">
            <p>
              OpenList uses the National Building Control Office&apos;s Building Commencement and Completion Data 2014–Present dataset to add post-planning construction context. The dataset contains details of Commencement Notices and Certificates of Compliance on Completion submitted through the Building Control Management System (BCMS) to all 31 Building Control Authorities since 2014.
            </p>
            <p>
              This dataset is published by the National Building Control Office on Ireland&apos;s Open Data Portal under the Creative Commons Attribution 4.0 International licence (CC BY 4.0). OpenList may match and transform these records to connect construction commencement or completion evidence with planning and property records; those matches and derived labels are OpenList processing rather than statements made by the source publisher.
            </p>
            <p className="rounded-xl border border-stone-200 bg-stone-50 p-4 text-stone-700">
              Building commencement and completion information: source National Building Control Office, derived from BCMS records submitted to Building Control Authorities. Licensed under Creative Commons Attribution 4.0 International (CC BY 4.0).
            </p>
            <p>
              A Commencement Notice indicates that the statutory building-control commencement process has been initiated; it is not, by itself, proof that every element of a development was physically started or completed. Likewise, OpenList only presents completion where supported by the published Certificate of Compliance on Completion data and does not infer completion solely from planning status.
            </p>
            <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
              <a href="https://data.gov.ie/dataset/bcnccc" target="_blank" rel="noreferrer" className={externalLinkClass}>
                Building Commencement and Completion dataset
              </a>
              <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noreferrer" className={externalLinkClass}>
                CC BY 4.0 licence
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
              <a href="https://www.psr.ie/psra-registers/" target="_blank" rel="noreferrer" className={externalLinkClass}>
                PSRA public registers
              </a>
              <a href="https://www.psr.ie/re-use-of-public-sector-information/" target="_blank" rel="noreferrer" className={externalLinkClass}>
                PSRA reuse terms
              </a>
            </div>
          </SourceSection>

          <SourceSection title="Maps">
            <p>
              Where OpenList displays an OpenStreetMap map, map data is provided by OpenStreetMap contributors. OpenStreetMap data is available under the Open Data Commons Open Database Licence (ODbL). Map attribution is also shown on the map itself where supplied by the embedded map service.
            </p>
            <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
              <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer" className={externalLinkClass}>
                © OpenStreetMap contributors
              </a>
            </div>
          </SourceSection>

          <SourceSection title="What OpenList changes">
            <p>
              OpenList does not simply republish source pages. We clean and standardise data for search, reconcile fields across authorities, classify planning lifecycle states, connect planning, appeals, construction and sold-price context, and may calculate or derive presentation fields from the underlying records. A derived or normalised OpenList value can therefore differ in wording from the source record even where it represents the same underlying information.
            </p>
            <p>
              We aim to distinguish source facts from OpenList-derived presentation and to avoid implying endorsement by any public authority. Government and local-authority names are used to identify the source of public records; official crests, logos and branding are not used to imply affiliation.
            </p>
          </SourceSection>

          <SourceSection title="Accuracy and authoritative records">
            <p>
              Public datasets can contain omissions, delays, inconsistent status wording and other errors. OpenList can also make mistakes when importing, matching or normalising information. The relevant planning authority remains the authoritative source for a planning application, An Coimisiún Pleanála remains authoritative for a linked appeal case, the National Building Control Office and relevant Building Control Authority remain authoritative for BCMS-derived commencement and completion information, and the PSRA remains the authoritative publisher of the Residential Property Price Register.
            </p>
            <p>
              If information matters to a planning, property, legal or financial decision, check the official source before relying on it. OpenList is an independent service and is not affiliated with, sponsored by or endorsed by the Department of Housing, Local Government and Heritage, An Coimisiún Pleanála, the LGMA, the National Building Control Office, any local authority or Building Control Authority, the PSRA, Agile Applications or OpenStreetMap.
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
