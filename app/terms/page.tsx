import type { Metadata } from "next"

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
        </div>

        <div className="mt-8 rounded-[28px] border border-slate-200 bg-white p-8 shadow-sm">
          <div className="max-w-3xl space-y-8 text-base leading-7 text-slate-600">
            <section>
              <h2 className="text-xl font-semibold tracking-tight text-slate-900">
                1. Overview
              </h2>
              <div className="mt-3 space-y-4">
                <p>
                  OpenList provides property information and self-service tools,
                  including sold-price data, planning information and viewing
                  management tools.
                </p>
                <p>By using OpenList, you agree to these Terms.</p>
              </div>
            </section>

            <section>
              <h2 className="text-xl font-semibold tracking-tight text-slate-900">
                2. Nature of Service
              </h2>
              <div className="mt-3 space-y-4">
                <p>OpenList acts solely as a technology and information provider.</p>
                <p>OpenList:</p>
                <ul className="list-disc space-y-2 pl-5">
                  <li>does not act as an estate agent or auctioneer</li>
                  <li>does not provide valuation services, pricing advice, or recommendations</li>
                  <li>does not act as a broker or legal adviser</li>
                  <li>does not participate in property negotiations or transactions</li>
                  <li>does not verify public property records for completeness or accuracy</li>
                </ul>
              </div>
            </section>

            <section>
              <h2 className="text-xl font-semibold tracking-tight text-slate-900">
                3. Property Data
              </h2>
              <div className="mt-3 space-y-4">
                <p>
                  OpenList may display publicly available property information,
                  including data from the Irish Residential Property Price
                  Register and public planning sources.
                </p>
                <p>This information:</p>
                <ul className="list-disc space-y-2 pl-5">
                  <li>is provided for general information only</li>
                  <li>does not constitute a valuation, advice, or recommendation</li>
                  <li>may be incomplete, delayed, or contain errors</li>
                  <li>should be checked against official sources before decisions are made</li>
                </ul>
              </div>
            </section>

            <section>
              <h2 className="text-xl font-semibold tracking-tight text-slate-900">
                4. Viewing Management Tools
              </h2>
              <div className="mt-3 space-y-4">
                <p>
                  OpenList provides tools to record, update, cancel and remember
                  property viewing appointments.
                </p>
                <p>
                  Users are responsible for entering accurate appointment,
                  location and contact details, and for ensuring that recipients
                  have agreed to receive relevant viewing communications.
                </p>
                <p>
                  OpenList may send confirmation, update, cancellation and
                  reminder emails based on the details entered by users.
                </p>
              </div>
            </section>

            <section>
              <h2 className="text-xl font-semibold tracking-tight text-slate-900">
                5. Accounts and Access
              </h2>
              <div className="mt-3 space-y-4">
                <p>
                  Some OpenList tools require sign-in. Users are responsible for
                  keeping access to their email account and sign-in links secure.
                </p>
                <p>
                  OpenList may restrict or remove access where use of the service
                  creates operational, legal, security or abuse concerns.
                </p>
              </div>
            </section>

            <section>
              <h2 className="text-xl font-semibold tracking-tight text-slate-900">
                6. User Responsibility
              </h2>
              <div className="mt-3 space-y-4">
                <p>Users are responsible for:</p>
                <ul className="list-disc space-y-2 pl-5">
                  <li>independently verifying relevant property information</li>
                  <li>checking official records before relying on public data</li>
                  <li>entering accurate viewing and contact information</li>
                  <li>making their own property, financial and legal decisions</li>
                  <li>obtaining professional advice where appropriate</li>
                </ul>
              </div>
            </section>

            <section>
              <h2 className="text-xl font-semibold tracking-tight text-slate-900">
                7. Limitation of Liability
              </h2>
              <div className="mt-3 space-y-4">
                <p>OpenList is not responsible for:</p>
                <ul className="list-disc space-y-2 pl-5">
                  <li>errors, omissions or delays in public property data</li>
                  <li>decisions made using information displayed on OpenList</li>
                  <li>missed, changed or cancelled viewing appointments</li>
                  <li>email delivery failures, delays or recipient-side filtering</li>
                  <li>outcomes of property, financial, legal or personal decisions</li>
                </ul>
                <p>Use of the platform is at your own risk.</p>
              </div>
            </section>

            <section>
              <h2 className="text-xl font-semibold tracking-tight text-slate-900">
                8. Changes to Service
              </h2>
              <div className="mt-3 space-y-4">
                <p>OpenList may update, modify, suspend or remove platform features at any time.</p>
              </div>
            </section>

            <section>
              <h2 className="text-xl font-semibold tracking-tight text-slate-900">
                9. Governing Law
              </h2>
              <div className="mt-3 space-y-4">
                <p>These Terms are governed by the laws of Ireland.</p>
              </div>
            </section>

            <section>
              <h2 className="text-xl font-semibold tracking-tight text-slate-900">
                10. Contact
              </h2>
              <div className="mt-3 space-y-4">
                <p>If you have questions about these Terms, please contact OpenList.</p>
              </div>
            </section>
          </div>
        </div>
      </section>
    </main>
  )
}
