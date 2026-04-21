import Image from "next/image"

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
            OpenList is designed for people who want to sell their home
            privately in Ireland.
          </p>
        </div>

        <div className="mt-10 grid gap-8 lg:grid-cols-[1.2fr_0.8fr] sm:mt-12">
          <div className="rounded-[28px] border border-slate-200 bg-white p-8 shadow-sm">
            <div className="space-y-5 text-base leading-7 text-slate-600">
              <p>
                It combines public sale price data with a simple listing
                approach, so you can view public sale prices and manage your
                own listing.
              </p>

              <p>
                Selling a home often means relying on estimates, agents and
                limited visibility into real market prices.
              </p>

              <p>
                OpenList takes a more direct approach — giving you access to
                actual sale prices and a clear way to present your property.
              </p>

              <p>
                It is a platform for private sellers who want a simpler, more
                direct way to manage their own sale.
              </p>

              <p>
                The aim is simple — to make it easier for people in Ireland to
                sell property privately, using real information and a clearer
                process.
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
            OpenList provides tools and information for private property sales.
            We do not provide legal, financial or property advice.
          </p>
        </div>
      </section>
    </main>
  )
}
