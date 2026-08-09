import type { Metadata } from "next"
import Image from "next/image"

export const metadata: Metadata = {
  title: "About OpenList | Property Intelligence Ireland",
  description:
    "Learn how OpenList connects Irish sold prices, planning applications and location context for property research.",
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
            OpenList helps people understand property in Ireland.
          </p>

          <p className="mx-auto mt-3 max-w-3xl text-sm leading-6 text-slate-600 sm:text-base sm:leading-7">
            Search sold prices and planning applications, then move between both datasets to understand places and development activity in context.
          </p>
        </div>

        <div className="mt-10 grid gap-8 lg:grid-cols-[1.2fr_0.8fr] sm:mt-12">
          <div className="rounded-[28px] border border-slate-200 bg-white p-8 shadow-sm">
            <div className="max-w-2xl space-y-5 text-base leading-7 text-slate-600 sm:space-y-6">
              <p>You can use OpenList to:</p>

              <ul className="list-disc space-y-3 pl-5">
                <li>Research public sold-price data and local market activity</li>
                <li>Search planning applications and explore development activity</li>
                <li>Move between planning activity and local sold-price context</li>
              </ul>

              <p>
                Sold-price information is based on public Irish Residential
                Property Price Register data. Planning information is based on
                publicly available sources and is provided for information
                purposes only.
              </p>

              <p>
                OpenList provides property intelligence and a secondary personal viewing utility. We
                are not an estate agent, auctioneer, valuer, broker or legal
                adviser.
              </p>

              <p>
                The aim is simple: make public property information easier to search,
                connect and understand without overstating what the source data proves.
              </p>
            </div>
          </div>

          <div className="space-y-6">
            <div className="rounded-[28px] border border-slate-200 bg-slate-50 p-7 shadow-sm">
              <p className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">
                With OpenList you can
              </p>
              <ul className="mt-5 list-disc space-y-3 pl-5 text-base leading-7 text-slate-700">
                <li>research sold prices</li>
                <li>search planning applications</li>
                <li>connect local planning and sold-price context</li>
              </ul>
            </div>

            <div className="rounded-[28px] border border-slate-200 bg-white p-7 shadow-sm">
              <p className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">
                Platform role
              </p>
              <div className="mt-4 space-y-4 text-base leading-7 text-slate-600">
                <p>OpenList provides property research context from sold-price and planning data. Viewings remains available as an optional signed-in account utility.</p>
                <p>OpenList is not an estate agent, auctioneer, valuer, broker or legal adviser.</p>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-8 rounded-[28px] border border-slate-200 bg-white p-8 shadow-sm">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">
            Important
          </p>
          <p className="mt-4 max-w-4xl text-base leading-7 text-slate-600">
            Sold-price information is based on public Irish Residential Property Price Register data. Planning information is based on publicly available sources and is provided for information purposes only. Users should independently verify relevant property information before making decisions.
          </p>
        </div>
      </section>
    </main>
  )
}
