import SellerListingV2Form from "@/components/SellerListingV2Form"
import { createListing } from "./actions"

export default function SellPage() {
  return (
    <main className="min-h-screen bg-white">
      <section className="mx-auto max-w-4xl px-6 py-12">
        <div className="mb-10">
          <p className="text-sm font-medium uppercase tracking-[0.24em] text-slate-500">
            OpenList
          </p>

          <h1 className="mt-2 text-4xl font-semibold tracking-tight text-slate-900">
            Sell your property professionally
          </h1>

          <p className="mt-3 max-w-2xl text-lg text-slate-600">
            Create a polished listing, generate premium copy with AI, and receive enquiries directly.
          </p>

          <p className="mt-3 text-sm text-slate-500">
            No agents. No commissions. Just a simple, modern way to sell.
          </p>
        </div>

        <SellerListingV2Form mode="create" submitAction={createListing} />
      </section>
    </main>
  )
}