import type { Metadata } from "next"
import SellerListingV2Form from "@/components/SellerListingV2Form"
import { createListing } from "./actions"

export const metadata: Metadata = {
  title: "List Your Home Privately | OpenList",
  robots: {
    index: false,
    follow: false,
  },
}

export default function SellPage() {
  return (
    <main className="min-h-screen bg-stone-50">
      <section className="relative overflow-hidden border-b border-stone-200 bg-gradient-to-b from-white via-stone-50 to-stone-100/60">
        <div className="mx-auto max-w-4xl px-4 py-14 text-center sm:px-6 sm:py-16 md:py-20">
          <p className="text-sm font-medium uppercase tracking-[0.28em] text-stone-500">
            Private property sales in Ireland
          </p>

          <h1 className="mt-4 text-4xl font-semibold tracking-tight text-stone-900 sm:text-5xl md:text-6xl">
            List your home privately
          </h1>

          <p className="mx-auto mt-6 max-w-2xl text-base leading-7 text-stone-600 sm:text-lg sm:leading-8">
            Create a clear, well-presented private sale listing for the Irish
            market, add your own wording, and receive enquiries directly from buyers.
          </p>

          <p className="mt-4 text-sm text-stone-500">
            A more direct way to market
            your property privately.
          </p>

          <div className="mx-auto mt-8 max-w-xl rounded-2xl border border-stone-200 bg-white/80 px-5 py-4 text-sm text-stone-600 shadow-sm">
            You stay in control of the listing, the enquiries and the private
            sale process. OpenList provides the platform, structure and presentation.
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-4xl px-4 py-10 sm:px-6 sm:py-12">
        <div className="rounded-[32px] border border-stone-200 bg-white p-5 shadow-sm sm:p-6 md:p-8">
          <SellerListingV2Form
            mode="create"
            submitAction={createListing}
          />
        </div>

        <div className="mt-10 space-y-3 text-center text-xs leading-5 text-stone-500">
          <p>
            OpenList is a marketing platform for private property listings in Ireland.
          </p>
          <p>
            Sellers are responsible for the accuracy of listing details.
            OpenList does not act as an estate agent or provide valuation,
            negotiation, or legal services.
          </p>
        </div>
      </section>
    </main>
  )
}
