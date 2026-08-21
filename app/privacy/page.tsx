import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Privacy Notice | OpenList",
  description: "How OpenList processes public planning and property information, accounts and viewing-planner information.",
  alternates: {
    canonical: "/privacy",
  },
}

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-white">
      <section className="mx-auto max-w-4xl px-6 py-10 sm:py-12">
        <div className="rounded-[32px] border border-slate-200 bg-slate-50 px-6 py-7 sm:px-10 sm:py-8">
          <h1 className="text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
            Privacy Notice
          </h1>
          <p className="mt-3 text-sm text-slate-500">Last updated: 21 August 2026</p>
        </div>

        <div className="mt-8 rounded-[28px] border border-slate-200 bg-white p-8 shadow-sm">
          <div className="max-w-3xl space-y-8 text-base leading-7 text-slate-600">
            <PrivacySection title="1. Who we are">
              <p>OpenList is an independently operated property-information service available at openlist.ie.</p>
              <p>OpenList determines how the personal data described in this notice is processed. For privacy enquiries, contact <PrivacyEmail />.</p>
            </PrivacySection>

            <PrivacySection title="2. Information OpenList processes">
              <h3 className="font-semibold text-slate-900">Public planning and property information</h3>
              <p>OpenList obtains information from publicly available official sources, including local-authority planning records, national public planning datasets and Ireland&apos;s Residential Property Price Register.</p>
              <p>Planning records may include applicant names, agents or representatives, application addresses or locations, reference numbers, development descriptions, application dates, decisions, statuses and other planning metadata supplied by the public authority. OpenList principally republishes and organises planning metadata; it does not deliberately collect sensitive information from planning application documents.</p>
              <h3 className="font-semibold text-slate-900">Account, alerts and viewing-planner information</h3>
              <p>When you sign in, request planning email updates or use the Viewing Planner, OpenList may process your email address, authentication and account identifiers, the planning applications you choose to follow, whether an alert is enabled, planning-alert delivery status and provider message identifiers, viewing locations and times, contact details you enter for viewers or property contacts, notification choices, notes, and operational information needed to provide those services.</p>
              <h3 className="font-semibold text-slate-900">Technical and usage information</h3>
              <p>OpenList and its infrastructure providers may process IP or request data, browser or device information, timestamps, authentication and security events, error or diagnostic information, and aggregate website analytics or performance information.</p>
            </PrivacySection>

            <PrivacySection title="3. Why OpenList uses information and its lawful bases">
              <h3 className="font-semibold text-slate-900">Public planning information</h3>
              <p>OpenList relies on legitimate interests under Article 6(1)(f) GDPR to process public planning information. Its legitimate interest is making official planning and property information easier to find, search, understand, compare, research and monitor.</p>
              <p>In doing so, OpenList considers the public nature and purpose of the source records, the nature of the information, reasonable expectations of individuals, the value of accessible planning information, possible impact on individuals and data minimisation. Information being public does not by itself mean it is not personal data.</p>
              <h3 className="font-semibold text-slate-900">Accounts, planning alerts and viewing communications</h3>
              <p>OpenList uses account and authentication information to provide the sign-in and account service you request, and to administer that service. It uses saved planning subscriptions and delivery records to send and operate the planning update emails you request, and viewing contact details and notification choices to send confirmations, updates, cancellations and reminders selected by the user. These are service communications, not permission for unrelated marketing.</p>
              <h3 className="font-semibold text-slate-900">Security, legal obligations and claims</h3>
              <p>OpenList also relies on legitimate interests in security, abuse and fraud prevention, and service reliability. It may process or retain information where necessary to comply with legal or regulatory obligations, or to establish, exercise or defend legal claims.</p>
            </PrivacySection>

            <PrivacySection title="4. Information obtained indirectly">
              <p>OpenList obtains planning information from public sources rather than directly from the people named in those records. It processes records at scale and often has no independent contact details for those individuals.</p>
              <p>Where applicable, OpenList may rely on Article 14(5)(b) GDPR where providing individual notices would be impossible or involve disproportionate effort. This is not an automatic blanket exemption. OpenList instead provides this publicly accessible notice, explains its sources and processing, provides a privacy contact, and allows objections or correction requests to be raised.</p>
            </PrivacySection>

            <PrivacySection title="5. Public pages and search engines">
              <p>Planning and property information displayed on public OpenList pages can be viewed by website visitors, and public pages may be indexed by search engines. OpenList publishes this information in the context of property and planning research, not to build personal profiles of planning applicants.</p>
              <p>If publication or indexing creates a particular privacy risk for you, contact <PrivacyEmail />. OpenList will consider the circumstances and applicable data-protection rights; this does not mean that information will automatically be deleted or de-indexed.</p>
            </PrivacySection>

            <PrivacySection title="6. Accuracy and corrections">
              <p>Much of OpenList&apos;s planning data comes from third-party official or public sources. The relevant public body remains the authoritative source, so inaccuracies in the source may need to be corrected with that authority. OpenList will correct errors caused by its own import, matching or display where appropriate. Send privacy or correction requests to <PrivacyEmail />.</p>
            </PrivacySection>

            <PrivacySection title="7. Service providers and international transfers">
              <p>OpenList uses Supabase for database and authentication services, Vercel for hosting, infrastructure, analytics and performance insights, and Resend to send planning-update and viewing-related transactional emails. These providers process information on OpenList&apos;s behalf for those functions. OpenList does not sell user email addresses or account information.</p>
              <p>Infrastructure providers may process data outside Ireland or the EEA. Where required, OpenList relies on appropriate transfer mechanisms provided for under applicable data-protection law.</p>
            </PrivacySection>

            <PrivacySection title="8. Retention">
              <p>Planning records form part of a historical public planning record and can remain useful for property and planning research over long periods. Continued processing may be reviewed where a particular privacy issue is raised.</p>
              <p>Account information is retained while needed to operate the account, with limited additional retention where needed for security, legal or operational reasons. Planning-alert subscriptions, associated delivery records and viewing-planner information are retained while needed for the active service and are subject to normal deletion and backup processes. You can stop a planning alert from My alerts or from the signed unsubscribe link in a planning update email, without signing in, and you can delete the alert from My alerts. Logs and technical data are retained only for periods appropriate to their operational or security purpose.</p>
            </PrivacySection>

            <PrivacySection title="9. Cookies, analytics and performance">
              <p>OpenList uses Vercel Web Analytics and Speed Insights to understand aggregate website use and performance. OpenList does not describe these tools as completely anonymous. If OpenList introduces non-essential tracking that requires consent, it will request consent where required.</p>
              <p>OpenList does not use open or click tracking in planning update emails.</p>
            </PrivacySection>

            <PrivacySection title="10. Your rights">
              <p>Subject to applicable law, you may have rights to information, access, rectification, erasure, restriction, objection and portability. Where processing relies on consent, you may withdraw it. These rights are not absolute.</p>
              <h3 className="font-semibold text-slate-900">Right to object</h3>
              <p>Because OpenList uses legitimate interests for public planning information, you may object on grounds relating to your particular situation. OpenList will consider the objection and assess whether compelling legitimate grounds justify continued processing. Contact <PrivacyEmail />.</p>
            </PrivacySection>

            <PrivacySection title="11. Marketing">
              <p>Planning update emails and viewing confirmations, updates, cancellations and reminders selected through the Viewing Planner are service communications. OpenList does not treat signing in, requesting planning alerts or using the Viewing Planner as consent to unrelated marketing. Any future marketing functionality will follow applicable consent and unsubscribe requirements.</p>
            </PrivacySection>

            <PrivacySection title="12. Security">
              <p>OpenList uses reasonable technical and organisational measures intended to protect information. No method of transmission or storage can be guaranteed completely secure.</p>
            </PrivacySection>

            <PrivacySection title="13. Complaints">
              <p>Please contact <PrivacyEmail /> first with a privacy concern. You may also complain to Ireland&apos;s supervisory authority, the <a className="font-medium text-slate-700 underline underline-offset-4 transition hover:text-slate-950" href="https://www.dataprotection.ie/" target="_blank" rel="noreferrer">Data Protection Commission</a>.</p>
            </PrivacySection>
          </div>
        </div>
      </section>
    </main>
  )
}

function PrivacySection({ title, children }: { title: string; children: React.ReactNode }) {
  return <section><h2 className="text-xl font-semibold tracking-tight text-slate-900">{title}</h2><div className="mt-3 space-y-4">{children}</div></section>
}

function PrivacyEmail() {
  return <a className="font-medium text-slate-700 underline underline-offset-4 transition hover:text-slate-950" href="mailto:privacy@openlist.ie">privacy@openlist.ie</a>
}
