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
                  OpenList is a self-service platform that allows property owners to create and manage their own property listings.
                </p>
                <p>By using OpenList, you agree to these Terms.</p>
              </div>
            </section>

            <section>
              <h2 className="text-xl font-semibold tracking-tight text-slate-900">
                2. Nature of Service
              </h2>
              <div className="mt-3 space-y-4">
                <p>OpenList provides tools to create and display property listings.</p>
                <p>OpenList:</p>
                <ul className="list-disc space-y-2 pl-5">
                  <li>does not act as an estate agent or auctioneer</li>
                  <li>does not provide valuation services, pricing advice, or recommendations</li>
                  <li>does not participate in negotiations or transactions</li>
                  <li>does not act on behalf of buyers or sellers</li>
                </ul>
                <p>All listings are created and managed directly by property owners.</p>
              </div>
            </section>

            <section>
              <h2 className="text-xl font-semibold tracking-tight text-slate-900">
                3. Seller Responsibility
              </h2>
              <div className="mt-3 space-y-4">
                <p>Sellers are solely responsible for:</p>
                <ul className="list-disc space-y-2 pl-5">
                  <li>Only property owners or persons with the owner&apos;s express authority may create a listing on OpenList.</li>
                  <li>the accuracy of listing information</li>
                  <li>setting and updating any asking price</li>
                  <li>handling enquiries and communications</li>
                  <li>arranging viewings</li>
                  <li>negotiating and agreeing any sale</li>
                  <li>completing any legal or financial steps required</li>
                </ul>
                <p>
                  By creating a listing, you confirm that you are the property owner or have the owner&apos;s express authority to market the property.
                </p>
                <p>OpenList does not verify listing details.</p>
              </div>
            </section>

            <section>
              <h2 className="text-xl font-semibold tracking-tight text-slate-900">
                4. Buyer Interaction
              </h2>
              <div className="mt-3 space-y-4">
                <p>Enquiries submitted through OpenList are sent directly to the seller.</p>
                <p>OpenList:</p>
                <ul className="list-disc space-y-2 pl-5">
                  <li>does not screen buyers</li>
                  <li>does not manage communications</li>
                  <li>does not handle offers or bids</li>
                </ul>
              </div>
            </section>

            <section>
              <h2 className="text-xl font-semibold tracking-tight text-slate-900">
                5. Property Data
              </h2>
              <div className="mt-3 space-y-4">
                <p>
                  OpenList may display publicly available property data, including data from the Irish Residential Property Price Register.
                </p>
                <p>This information:</p>
                <ul className="list-disc space-y-2 pl-5">
                  <li>is provided for general information only</li>
                  <li>does not constitute a valuation or advice</li>
                  <li>may be incomplete or contain errors</li>
                </ul>
              </div>
            </section>

            <section>
              <h2 className="text-xl font-semibold tracking-tight text-slate-900">
                6. Platform Role
              </h2>
              <div className="mt-3 space-y-4">
                <p>OpenList acts solely as a technology provider.</p>
                <p>OpenList is not a party to any transaction between users.</p>
              </div>
            </section>

            <section>
              <h2 className="text-xl font-semibold tracking-tight text-slate-900">
                7. Limitation of Liability
              </h2>
              <div className="mt-3 space-y-4">
                <p>OpenList is not responsible for:</p>
                <ul className="list-disc space-y-2 pl-5">
                  <li>the accuracy of listings</li>
                  <li>decisions made by buyers or sellers</li>
                  <li>outcomes of property transactions</li>
                </ul>
                <p>Use of the platform is at your own risk.</p>
              </div>
            </section>

            <section>
              <h2 className="text-xl font-semibold tracking-tight text-slate-900">
                8. Changes to Service
              </h2>
              <div className="mt-3 space-y-4">
                <p>OpenList may update or modify the platform at any time.</p>
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
