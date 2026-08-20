import type { Metadata } from "next"
import Link from "next/link"

export const metadata: Metadata = {
  title: "Terms of Service | OpenList",
}

export default function TermsPage() {
  return (
    <main className="min-h-screen bg-white">
      <section className="mx-auto max-w-4xl px-6 py-10 sm:py-12">
        <div className="rounded-[32px] border border-slate-200 bg-slate-50 px-6 py-7 sm:px-10 sm:py-8">
          <h1 className="text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
            Terms of Service
          </h1>
          <p className="mt-3 text-sm text-slate-500">Last updated: 12 August 2026</p>
        </div>

        <div className="mt-8 rounded-[28px] border border-slate-200 bg-white p-8 shadow-sm">
          <div className="max-w-3xl space-y-8 text-base leading-7 text-slate-600">
            <TermsSection title="1. Overview">
              <p>OpenList is an independently operated property-information service.</p>
              <p>
                OpenList provides property information and self-service tools, including sold-price data,
                planning information, local property insights and viewing management tools.
              </p>
              <p>By using OpenList, you agree to these Terms.</p>
            </TermsSection>

            <TermsSection title="2. Nature of Service">
              <p>OpenList acts as a technology and information provider.</p>
              <p>OpenList:</p>
              <TermsList items={[
                "does not act as an estate agent or auctioneer",
                "does not provide valuations, pricing advice, investment advice or recommendations",
                "does not act as a broker, solicitor or other professional adviser",
                "does not participate in property negotiations or transactions",
                "does not independently verify public property records for completeness or accuracy",
              ]} />
              <p>
                Nothing displayed on OpenList should be treated as a substitute for appropriate professional
                advice or an official source.
              </p>
            </TermsSection>

            <TermsSection title="3. Property and Planning Data">
              <p>
                OpenList may display information obtained from public sources, including the Irish Residential
                Property Price Register, local authority planning records and national public planning datasets.
              </p>
              <p>
                Public planning information may include the names of applicants or agents where those details
                are included in the public source.
              </p>
              <p>Public-source information may:</p>
              <TermsList items={[
                "be incomplete, delayed or contain errors",
                "change after it has been imported by OpenList",
                "differ between local authorities or source datasets",
                "omit fields that are not supplied by the relevant source",
              ]} />
              <p>
                Users should check important information against the relevant official source before making a
                property, financial or legal decision.
              </p>
            </TermsSection>

            <TermsSection title="4. OpenList Insights and Calculations">
              <p>OpenList may process public property information to create additional information such as:</p>
              <TermsList items={[
                "local price summaries and medians",
                "market trends and comparisons",
                "rankings and activity measures",
                "location and Eircode context",
                "nearby sold-price or planning results",
                "calculated geographic distances",
              ]} />
              <p>
                These are OpenList-generated calculations or interpretations of available data. They are not
                official valuations, property-price indices, planning determinations or statements made by the
                underlying public authority.
              </p>
              <p>Results may be approximate and depend on the quality and coverage of the underlying data.</p>
            </TermsSection>

            <TermsSection title="5. Viewing Management Tools">
              <p>
                OpenList provides personal tools for recording and managing property viewings, including dates,
                locations, notes and relevant contact details.
              </p>
              <p>Users are responsible for:</p>
              <TermsList items={[
                "entering accurate information",
                "having an appropriate reason or authority to provide another person’s contact details",
                "using those details only for legitimate viewing-related purposes",
                "avoiding unnecessary or inappropriate personal information in notes",
              ]} />
              <p>
                OpenList may send viewing confirmations, updates, cancellations and reminders based on
                information entered by users.
              </p>
              <p>OpenList does not guarantee delivery of emails or attendance at viewing appointments.</p>
            </TermsSection>

            <TermsSection title="6. Accounts and Access">
              <p>Some OpenList tools require sign-in.</p>
              <p>
                Users are responsible for maintaining the security of access to their email account and
                authentication links.
              </p>
              <p>
                OpenList may restrict, suspend or remove access where reasonably necessary for security, legal,
                operational or abuse-prevention reasons.
              </p>
              <p>
                Users must not intentionally interfere with, overload, damage or attempt to gain unauthorised
                access to OpenList or its systems.
              </p>
            </TermsSection>

            <TermsSection title="7. User Responsibility">
              <p>Users are responsible for:</p>
              <TermsList items={[
                "independently verifying relevant property information",
                "checking official records before relying on public data",
                "entering accurate viewing and contact information",
                "deciding whether information is appropriate for their circumstances",
                "making their own property, financial and legal decisions",
                "obtaining professional advice where appropriate",
              ]} />
            </TermsSection>

            <TermsSection title="8. Availability">
              <p>OpenList may update, modify, suspend or remove features or datasets.</p>
              <p>
                The service may occasionally be unavailable because of maintenance, technical problems,
                third-party services or circumstances outside OpenList’s reasonable control.
              </p>
              <p>
                OpenList does not guarantee that any particular dataset, record or feature will remain available
                indefinitely.
              </p>
            </TermsSection>

            <TermsSection title="9. Liability">
              <p>To the fullest extent permitted by law, OpenList is not responsible for losses arising solely from:</p>
              <TermsList items={[
                "errors, omissions or delays in public-source property data",
                "inaccuracies in derived calculations or location matching",
                "decisions made in reliance on information displayed on OpenList",
                "missed, changed or cancelled viewing appointments",
                "email delivery failures, delays or recipient-side filtering",
                "temporary interruption or unavailability of the service",
              ]} />
              <p>
                Nothing in these Terms excludes or limits any liability or consumer right that cannot lawfully be
                excluded or limited.
              </p>
            </TermsSection>

            <TermsSection title="10. Intellectual Property and Public Data">
              <p>
                OpenList’s software, branding, design and original content are protected by applicable
                intellectual-property rights.
              </p>
              <p>
                Third-party and public datasets remain subject to the rights, licences and attribution requirements
                applicable to those datasets.
              </p>
              <p>Nothing in these Terms gives OpenList ownership of third-party public records.</p>
            </TermsSection>

            <TermsSection title="11. Privacy">
              <p>OpenList processes personal data in accordance with applicable data-protection law. See the <Link href="/privacy" className="font-medium text-slate-700 underline underline-offset-4 transition hover:text-slate-950">Privacy Notice</Link>.</p>
            </TermsSection>

            <TermsSection title="12. Changes to These Terms">
              <p>
                OpenList may update these Terms to reflect changes to the service, applicable law or operational
                requirements.
              </p>
              <p>The latest version will be published on OpenList.</p>
            </TermsSection>

            <TermsSection title="13. Governing Law">
              <p>These Terms are governed by the laws of Ireland.</p>
              <p>Any statutory rights available to consumers remain unaffected.</p>
            </TermsSection>

            <TermsSection title="14. Contact">
              <p>If you have questions about these Terms, please contact OpenList.</p>
            </TermsSection>
          </div>
        </div>
      </section>
    </main>
  )
}

function TermsSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-xl font-semibold tracking-tight text-slate-900">{title}</h2>
      <div className="mt-3 space-y-4">{children}</div>
    </section>
  )
}

function TermsList({ items }: { items: string[] }) {
  return (
    <ul className="list-disc space-y-2 pl-5">
      {items.map((item) => <li key={item}>{item}</li>)}
    </ul>
  )
}
