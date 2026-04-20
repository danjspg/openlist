import Link from "next/link"
import {
  areaSlug,
  compactAddress,
  formatPprCurrency,
  formatPprDate,
  type PprSale,
} from "@/lib/ppr"

export default function PprSaleCard({ sale }: { sale: PprSale }) {
  const locality = sale.locality?.trim()
  const county = sale.county?.trim()
  const area = sale.area_slug || (locality ? areaSlug(locality) : "")

  return (
    <article className="rounded-[28px] border border-stone-200 bg-white p-5 shadow-sm transition hover:shadow-md sm:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="text-sm font-medium uppercase tracking-[0.18em] text-stone-500">
            {formatPprDate(sale.date_of_sale)}
          </p>
          <h2 className="mt-3 break-words text-xl font-semibold leading-snug tracking-tight text-stone-900 sm:text-2xl">
            {compactAddress(sale.address_raw)}
          </h2>
          <p className="mt-2 text-sm leading-6 text-stone-600">
            {[locality, county].filter(Boolean).join(", ")}
          </p>
        </div>

        <div className="shrink-0 rounded-2xl border border-stone-200 bg-stone-50 px-4 py-3">
          <p className="text-xs uppercase tracking-[0.18em] text-stone-500">
            Sold price
          </p>
          <p className="mt-1 text-2xl font-semibold tracking-tight text-stone-900">
            {formatPprCurrency(sale.price_eur)}
          </p>
        </div>
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        {sale.property_description_raw && (
          <span className="rounded-full border border-stone-200 bg-stone-50 px-3 py-1 text-xs font-medium text-stone-600">
            {sale.property_description_raw}
          </span>
        )}
        {sale.is_new_dwelling !== null && sale.is_new_dwelling !== undefined && (
          <span className="rounded-full border border-stone-200 bg-stone-50 px-3 py-1 text-xs font-medium text-stone-600">
            {sale.is_new_dwelling ? "New dwelling" : "Second-hand dwelling"}
          </span>
        )}
        {sale.vat_exclusive !== null && sale.vat_exclusive !== undefined && (
          <span className="rounded-full border border-stone-200 bg-stone-50 px-3 py-1 text-xs font-medium text-stone-600">
            {sale.vat_exclusive ? "VAT exclusive" : "VAT included"}
          </span>
        )}
      </div>

      {county && area && (
        <Link
          href={`/sold-prices/${encodeURIComponent(county)}/${area}`}
          className="mt-5 inline-flex text-sm font-medium text-stone-700 transition hover:text-stone-950"
        >
          View area prices
        </Link>
      )}
    </article>
  )
}
