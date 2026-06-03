import type { Metadata } from "next"
import Image from "next/image"

export const metadata: Metadata = {
  title: "About OpenList | Property Tools Ireland",
  description:
    "Learn about OpenList, a self-service platform for property listings, sold-price research and viewing organisation in Ireland.",
  alternates: {
    canonical: "/about",
  },
}

export default function AboutPage() {
  return (
    <main className="min-h-screen bg-white">
      <section className="mx-auto max-w-6xl px-6 py-10 sm:py-12">
        <div className="rounded-[32px] border border-slate-200 bg-slate-50 px-6 py-7 text-center sm:px-10 sm:py-8">
          <div className="flex justify-center">
            <Image
              src="/logo-v2.png"
              alt="OpenList"
              width={260}
              height={76}
              className="h-auto w-52 sm:w-64"
              priority
            />
          </div>

          <h1 className="mx-auto mt-4 max-w-4xl text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
            About OpenList
          </h1>

          <p className="mx-auto mt-5 max-w-3xl text-base leading-7 text-slate-600 sm:text-lg sm:leading-8">
            OpenList provides software tools for property listings, sold-price research and viewing organisation in Ireland.
          </p>

          <p className="mx-auto mt-3 max-w-3xl text-sm leading-6 text-slate-600 sm:text-base sm:leading-7">
            Users remain responsible for their own listings, enquiries, viewings and decisions.
          </p>
        </div>

        <div className="mt-10 grid gap-8 lg:grid-cols-[1.2fr_0.8fr] sm:mt-12">
          <div className="rounded-[28px] border border-slate-200 bg-white p-8 shadow-sm">
            <div className="max-w-2xl space-y-5 text-base leading-7 text-slate-600 sm:space-y-6">
              <p>
                OpenList is a self-service platform for property listings,
                sold-price information and viewing organisation in Ireland.
              </p>

              <p>
                Listings are created and managed by users, and enquiries go
                directly to the listing contact.
              </p>

              <p>
                It combines public sale price data, listing tools and viewing
                administration in one place.
              </p>

              <p>
                It provides access to recent sale prices, local market reports
                and tools to create and manage your own property information.
              </p>

              <p>
                The aim is simple — to make common property administration
                tasks clearer using self-service software and public information.
              </p>

              <p>
                Private listings remain part of OpenList, alongside tools for
                sold-price research and viewing organisation.
              </p>
            </div>
          </div>

          <div className="space-y-6">
            <div className="rounded-[28px] border border-slate-200 bg-slate-50 p-7 shadow-sm">
              <p className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">
                With OpenList you can
              </p>
              <ul className="mt-5 list-disc space-y-3 pl-5 text-base leading-7 text-slate-700">
                <li>see public sale prices</li>
                <li>browse property listings</li>
                <li>create a straightforward listing</li>
                <li>organise property viewings</li>
                <li>deal directly with buyers</li>
              </ul>
            </div>

            <div className="rounded-[28px] border border-slate-200 bg-white p-7 shadow-sm">
              <p className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">
                Platform role
              </p>
              <div className="mt-4 space-y-4 text-base leading-7 text-slate-600">
                <p>You stay in control at every stage.</p>
                <p>OpenList is not an estate agent.</p>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-8 rounded-[28px] border border-slate-200 bg-white p-8 shadow-sm">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">
            Important
          </p>
          <p className="mt-4 max-w-4xl text-base leading-7 text-slate-600">
            OpenList is a self-service listing and marketing platform. It does not act as an estate agent or auctioneer and does not provide valuation services, pricing advice, negotiation services, legal services, brokerage services, or transaction management.
          </p>
        </div>
      </section>
    </main>
  )
}
