import type { Metadata } from "next"
import Link from "next/link"

export const metadata: Metadata = {
  title: "About OpenList | Understand Planning in Ireland",
  description:
    "OpenList turns fragmented Irish planning records into a clearer story: what is proposed, what happens next, what was decided and what changed along the way.",
  alternates: { canonical: "/about" },
}

const stages = [
  {
    step: "01",
    label: "An application is registered",
    title: "Something is proposed",
    body: "A house extension. Fifty homes. A supermarket. A hotel. A wind farm. The planning record starts with a proposal, an address and a reference number. OpenList makes that record searchable and puts the description into a consistent, readable layout.",
    source: "Planning authority registers · National Planning Application Database",
    tone: "bg-sky-50 border-sky-200",
    dot: "bg-sky-500",
  },
  {
    step: "02",
    label: "The application moves",
    title: "The story changes",
    body: "Planning is rarely just an application and a final answer. A council may ask for further information. Revised material can arrive. Dates move. OpenList brings those lifecycle events together so you can see what happened, and in what order, without decoding several disconnected records.",
    source: "Local-authority planning records · OpenList-normalised lifecycle events",
    tone: "bg-amber-50 border-amber-200",
    dot: "bg-amber-500",
  },
  {
    step: "03",
    label: "A decision is made",
    title: "Granted, refused, or not finished yet",
    body: "The outcome should be obvious. OpenList separates applications still in progress from decisions, and presents grants, grants with conditions, refusals and other final states in plain language with consistent visual status cues.",
    source: "Planning authority decision records",
    tone: "bg-emerald-50 border-emerald-200",
    dot: "bg-emerald-500",
  },
  {
    step: "04",
    label: "Sometimes there is an appeal",
    title: "A council decision may not be the end",
    body: "Where an appeal can be matched to the original application, OpenList connects the appeal back into the same story. That matters because the final planning position can differ from the council's original decision.",
    source: "An Coimisiún Pleanála public case information · Planning authority records",
    tone: "bg-violet-50 border-violet-200",
    dot: "bg-violet-500",
  },
]

export default function AboutPage() {
  return (
    <main className="min-h-screen bg-white text-slate-900">
      <section className="border-b border-slate-200 bg-[radial-gradient(circle_at_top_left,_#e0f2fe_0,_transparent_34%),radial-gradient(circle_at_85%_20%,_#dcfce7_0,_transparent_26%),linear-gradient(to_bottom,_#f8fafc,_#ffffff)]">
        <div className="mx-auto max-w-6xl px-6 py-16 sm:py-24">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-sky-700">About OpenList</p>
          <h1 className="mt-5 max-w-4xl text-4xl font-semibold tracking-tight text-slate-950 sm:text-6xl sm:leading-[1.05]">
            Planning tells you what may change around a property.
            <span className="block text-slate-500">We make that story easier to follow.</span>
          </h1>
          <p className="mt-7 max-w-3xl text-lg leading-8 text-slate-600 sm:text-xl sm:leading-9">
            Irish planning information is public, but understanding one application can mean jumping between council pages, unfamiliar status labels, decision records and appeals. OpenList brings those pieces together into one clearer view.
          </p>
          <div className="mt-9 flex flex-wrap gap-3">
            <Link href="/planning" className="rounded-full bg-slate-950 px-6 py-3 text-sm font-semibold text-white transition hover:bg-slate-800">
              Explore planning
            </Link>
            <Link href="/data-sources" className="rounded-full border border-slate-300 bg-white px-6 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50">
              See our data sources
            </Link>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 py-14 sm:py-20">
        <div className="grid gap-10 lg:grid-cols-[0.75fr_1.25fr] lg:gap-16">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">Why it exists</p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">The public record is useful. The experience of reading it often isn't.</h2>
          </div>
          <div className="space-y-5 text-lg leading-8 text-slate-600">
            <p>
              If you hear that a development is planned near you, you probably do not want to learn the vocabulary and structure of Ireland's planning system first. You want to know <strong className="font-semibold text-slate-900">what is proposed, where it is, what stage it has reached and what happened next.</strong>
            </p>
            <p>
              OpenList is built around that question. It searches and organises public records, reconciles inconsistent status wording, connects lifecycle events and highlights significant development so the underlying planning story is easier to understand.
            </p>
            <p>
              It is not a replacement for the official record. It is a better starting point for finding and understanding it.
            </p>
          </div>
        </div>
      </section>

      <section className="border-y border-slate-200 bg-slate-50">
        <div className="mx-auto max-w-6xl px-6 py-14 sm:py-20">
          <div className="max-w-3xl">
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">A planning application, as a story</p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">From proposal to outcome</h2>
            <p className="mt-4 text-lg leading-8 text-slate-600">
              The exact route varies, but these are the moments OpenList is trying to make visible and understandable.
            </p>
          </div>

          <div className="relative mt-12">
            <div className="absolute bottom-8 left-[19px] top-8 hidden w-px bg-slate-300 sm:block" />
            <div className="space-y-6">
              {stages.map((stage) => (
                <article key={stage.step} className="relative sm:pl-16">
                  <div className={`absolute left-0 top-8 hidden h-10 w-10 items-center justify-center rounded-full ${stage.dot} text-xs font-bold text-white shadow-sm ring-8 ring-slate-50 sm:flex`}>
                    {stage.step}
                  </div>
                  <div className={`rounded-[28px] border p-6 shadow-sm sm:p-8 ${stage.tone}`}>
                    <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">{stage.label}</p>
                    <h3 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">{stage.title}</h3>
                    <p className="mt-4 max-w-4xl text-base leading-7 text-slate-700">{stage.body}</p>
                    <div className="mt-5 border-t border-slate-900/10 pt-4 text-sm leading-6 text-slate-500">
                      <span className="font-semibold text-slate-700">Data behind this stage:</span> {stage.source}
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 py-14 sm:py-20">
        <div className="grid gap-6 md:grid-cols-3">
          <div className="rounded-[28px] border border-slate-200 p-7">
            <p className="text-sm font-semibold text-sky-700">Find it</p>
            <h3 className="mt-2 text-xl font-semibold">Search across Ireland</h3>
            <p className="mt-3 leading-7 text-slate-600">Search by place, address or planning reference instead of starting by working out which public system holds the record.</p>
          </div>
          <div className="rounded-[28px] border border-slate-200 p-7">
            <p className="text-sm font-semibold text-amber-700">Understand it</p>
            <h3 className="mt-2 text-xl font-semibold">Turn records into a timeline</h3>
            <p className="mt-3 leading-7 text-slate-600">Dates, status changes, decisions and appeals make more sense when they are shown as one sequence rather than isolated fields.</p>
          </div>
          <div className="rounded-[28px] border border-slate-200 p-7">
            <p className="text-sm font-semibold text-emerald-700">Follow it</p>
            <h3 className="mt-2 text-xl font-semibold">Keep an eye on what matters</h3>
            <p className="mt-3 leading-7 text-slate-600">Planning alerts help you follow an area rather than repeatedly checking for new applications and changes yourself.</p>
          </div>
        </div>
      </section>

      <section className="bg-slate-950 text-white">
        <div className="mx-auto max-w-6xl px-6 py-14 sm:py-20">
          <div className="grid gap-10 lg:grid-cols-2 lg:gap-16">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.2em] text-sky-300">Where sold prices fit</p>
              <h2 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">Planning first. Property context alongside it.</h2>
            </div>
            <div className="space-y-5 text-lg leading-8 text-slate-300">
              <p>
                Sold prices answer a different question: <strong className="font-semibold text-white">what have homes actually sold for nearby?</strong> OpenList uses Ireland's Residential Property Price Register to make those public records easier to search and compare.
              </p>
              <p>
                That matters because property research is rarely only about a sale price or only about a planning application. The useful picture is the place itself: what has sold, what is proposed nearby and how the area may be changing.
              </p>
              <Link href="/sold-prices" className="inline-flex font-semibold text-sky-300 hover:text-sky-200">Explore sold prices →</Link>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 py-14 sm:py-20">
        <div className="rounded-[32px] border border-slate-200 bg-slate-50 p-7 sm:p-10">
          <div className="grid gap-8 lg:grid-cols-[0.8fr_1.2fr]">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">How OpenList handles the data</p>
              <h2 className="mt-3 text-2xl font-semibold tracking-tight sm:text-3xl">We organise the record. We don't pretend to be the record.</h2>
            </div>
            <div className="space-y-4 leading-7 text-slate-600">
              <p>OpenList combines public planning information from Irish planning authorities and national datasets. We clean fields, standardise inconsistent wording, connect records and derive presentation such as lifecycle states and timelines.</p>
              <p>That processing can make the information much easier to use, but public datasets can be late, incomplete or inconsistent, and OpenList can make mistakes too. For anything consequential, follow the source link and check the relevant planning authority or other official publisher.</p>
              <p>Sold-price information comes from the Residential Property Price Register maintained by the Property Services Regulatory Authority. Map data, where shown, comes from OpenStreetMap contributors.</p>
              <Link href="/data-sources" className="inline-flex font-semibold text-sky-700 hover:text-sky-800">Data sources, licensing and limitations →</Link>
            </div>
          </div>
        </div>
      </section>

      <section className="border-t border-slate-200">
        <div className="mx-auto max-w-6xl px-6 py-14 text-center sm:py-20">
          <p className="mx-auto max-w-3xl text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
            OpenList is an independent research service for people who want to understand what is happening to places in Ireland.
          </p>
          <p className="mx-auto mt-5 max-w-2xl leading-7 text-slate-600">
            It is not an estate agent, auctioneer, valuer, broker, planning authority or legal adviser. Public information should be verified with the relevant official source before you rely on it.
          </p>
          <Link href="/planning" className="mt-7 inline-flex rounded-full bg-slate-950 px-6 py-3 text-sm font-semibold text-white hover:bg-slate-800">Start with planning</Link>
        </div>
      </section>
    </main>
  )
}
