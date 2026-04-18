import Image from "next/image"
import Link from "next/link"

export default function AboutPage() {
  return (
    <main className="min-h-screen bg-white">
      <section className="mx-auto max-w-6xl px-6 py-14 sm:py-18">
        <div className="rounded-[32px] border border-slate-200 bg-slate-50 px-8 py-12 text-center sm:px-12 sm:py-16">
          <div className="flex justify-center">
            <Image
              src="/logo.jpg"
              alt="OpenList"
              width={220}
              height={80}
              className="h-auto w-auto"
              priority
            />
          </div>

          <p className="mt-8 text-base font-semibold tracking-tight text-slate-700">
            About OpenList
          </p>

          <h1 className="mx-auto mt-4 max-w-4xl text-4xl font-semibold tracking-tight text-slate-900 sm:text-5xl">
            A more modern way to present property
          </h1>

          <p className="mx-auto mt-6 max-w-3xl text-lg leading-8 text-slate-600 sm:text-xl">
            OpenList is designed to help property listings feel clearer, more considered,
            and more trustworthy online — starting with private sellers and a simpler,
            more direct way to market property.
          </p>
        </div>

        <div className="mt-16 grid gap-10 lg:grid-cols-[1.45fr_0.85fr] lg:items-start">
          <div>
            <p className="text-base font-semibold tracking-tight text-slate-700">
              Why it exists
            </p>

            <h2 className="mt-3 max-w-4xl text-3xl font-semibold tracking-tight text-slate-900 sm:text-[2.2rem]">
              Property deserves better presentation than a crowded portal.
            </h2>

            <div className="mt-8 space-y-6 text-lg leading-8 text-slate-600">
              <p>
                Most property platforms are built around volume. OpenList is
                built around presentation. The aim is not just to host listings,
                but to help each property appear with more clarity, quality, and intent.
              </p>

              <p>
                That means cleaner layouts, stronger imagery, calmer spacing,
                and a more focused experience for both buyers and sellers.
                The property should feel properly presented, not compressed into
                a noisy template.
              </p>

              <p>
                Whether it is a site, a family home, or a standout contemporary
                property, OpenList is designed to give sellers a more polished
                way to market property and buyers a more trustworthy way to browse it.
              </p>

              <p>
                While OpenList is initially focused on private sellers, the
                underlying approach is designed to support a wider range of
                property listings over time.
              </p>
            </div>
          </div>

          <aside className="rounded-[28px] border border-slate-200 bg-white p-7 shadow-sm">
            <p className="text-base font-semibold tracking-tight text-slate-700">
              What matters
            </p>

            <div className="mt-6 space-y-6">
              <div className="rounded-2xl bg-slate-50 p-5">
                <h3 className="text-lg font-semibold text-slate-900">Clarity</h3>
                <p className="mt-2 leading-7 text-slate-600">
                  Information should be easy to scan, easy to understand, and easy to trust.
                </p>
              </div>

              <div className="rounded-2xl bg-slate-50 p-5">
                <h3 className="text-lg font-semibold text-slate-900">
                  Presentation
                </h3>
                <p className="mt-2 leading-7 text-slate-600">
                  Strong property marketing starts with strong presentation — not cluttered templates or visual noise.
                </p>
              </div>

              <div className="rounded-2xl bg-slate-50 p-5">
                <h3 className="text-lg font-semibold text-slate-900">Trust</h3>
                <p className="mt-2 leading-7 text-slate-600">
                  A cleaner, more transparent experience helps buyers engage with more confidence and helps sellers present more professionally.
                </p>
              </div>
            </div>
          </aside>
        </div>

        <div className="mt-16 rounded-[28px] border border-slate-200 bg-white p-8 shadow-sm">
          <p className="text-base font-semibold tracking-tight text-slate-700">
            Transparency and platform role
          </p>

          <div className="mt-5 space-y-5 text-base leading-7 text-slate-600">
            <p>
              OpenList is a marketing platform designed to help individuals and
              property owners present listings professionally and receive enquiries directly.
            </p>

            <p>
              OpenList does not act as an estate agent and does not provide
              valuation, negotiation, conveyancing, or legal services. Listing
              information is supplied by sellers, and interested parties should
              satisfy themselves as to accuracy.
            </p>
          </div>
        </div>

        <div className="mt-16 grid gap-6 md:grid-cols-3">
          <div className="rounded-[24px] border border-slate-200 bg-white p-7 shadow-sm">
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">
              For buyers
            </p>
            <p className="mt-4 leading-8 text-slate-600">
              Browse listings in a calmer environment where the property itself
              is allowed to stand out.
            </p>
          </div>

          <div className="rounded-[24px] border border-slate-200 bg-white p-7 shadow-sm">
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">
              For sellers
            </p>
            <p className="mt-4 leading-8 text-slate-600">
              Present your property with a more polished, premium feel that
              better reflects its value and gives you more control over the process.
            </p>
          </div>

          <div className="rounded-[24px] border border-slate-200 bg-white p-7 shadow-sm">
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">
              For the future
            </p>
            <p className="mt-4 leading-8 text-slate-600">
              OpenList is being built as a more modern platform for property
              listings — with better presentation, simpler tools, and a more
              direct experience for sellers and property owners.
            </p>
          </div>
        </div>

        <div className="mt-16 rounded-[32px] bg-slate-900 px-8 py-10 text-white sm:px-10 sm:py-12">
          <div className="max-w-3xl">
            <p className="text-sm font-medium uppercase tracking-[0.24em] text-slate-300">
              OpenList
            </p>

            <h2 className="mt-4 text-3xl font-semibold tracking-tight sm:text-4xl">
              Thoughtful property presentation for a more modern market.
            </h2>

            <p className="mt-5 leading-8 text-slate-300">
              The ambition is simple: make online property feel more refined,
              more intentional, and more trustworthy — for every kind of home,
              site, and standout listing.
            </p>

            <p className="mt-5 leading-8 text-slate-300">
              OpenList is built for private property listings, with presentation
              and clarity at the centre of the experience.
            </p>

            <div className="mt-8">
              <Link
                href="/listings"
                className="inline-flex rounded-full bg-white px-5 py-2.5 text-sm font-medium text-slate-900 transition hover:bg-slate-200"
              >
                Browse listings
              </Link>
            </div>
          </div>
        </div>
      </section>
    </main>
  )
}