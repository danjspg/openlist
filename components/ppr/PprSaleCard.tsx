import Link from "next/link"
import {
  areaSlug,
  compactAddress,
  formatPprCurrency,
  formatPprDate,
  formatPropertyTags,
  type PprSale,
} from "@/lib/ppr"

export default function PprSaleCard({
  sale,
  showAreaLink = true,
}: {
  sale: PprSale
  showAreaLink?: boolean
}) {
  const locality = sale.locality?.trim()
  const county = sale.county?.trim()
  const area = sale.area_slug || (locality ? areaSlug(locality) : "")
  const tags = formatPropertyTags(sale)

  return (
    <article className="rounded-[28px] border border-stone-200 bg-white p-5 shadow-sm transition hover:shadow-md sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-500">
            {formatPprDate(sale.date_of_sale)}
          </p>
          <h2 className="mt-2.5 break-words text-xl font-semibold leading-snug tracking-tight text-stone-900 sm:text-2xl">
            {compactAddress(sale.address_raw)}
          </h2>
          <p className="mt-2 text-sm leading-6 text-stone-600">
            {[locality, county].filter(Boolean).join(", ")}
          </p>
        </div>

        <div className="shrink-0 rounded-2xl border border-stone-200 bg-stone-50 px-4 py-2.5">
          <p className="text-xs uppercase tracking-[0.18em] text-stone-500">
            Sold price
          </p>
          <p className="mt-1 text-2xl font-semibold tracking-tight text-stone-900">
            {formatPprCurrency(sale.price_eur)}
          </p>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {tags.map((tag) => (
          <span
            key={tag}
            className="rounded-full border border-stone-200 bg-stone-50 px-3 py-1 text-xs font-medium text-stone-600"
          >
            {tag}
          </span>
        ))}
      </div>

      {showAreaLink && county && area && (
        <Link
          href={`/sold-prices/${encodeURIComponent(county.toLowerCase())}/${area}`}
          className="mt-4 inline-flex min-h-10 items-center rounded-full border border-emerald-700 bg-emerald-700 px-4 text-sm font-semibold text-white shadow-sm transition hover:border-emerald-800 hover:bg-emerald-800"
        >
          View area prices <span aria-hidden="true" className="ml-1.5">→</span>
        </Link>
      )}
    </article>
  )
}
