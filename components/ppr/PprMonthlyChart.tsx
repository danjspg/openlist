import {
  formatPprCurrency,
  formatPprDate,
  type PprAreaMonthly,
} from "@/lib/ppr"

export default function PprMonthlyChart({
  monthly,
}: {
  monthly: PprAreaMonthly[]
}) {
  if (monthly.length === 0) {
    return (
      <div className="rounded-[28px] border border-stone-200 bg-white p-6 text-stone-600 shadow-sm">
        Monthly trends will appear here once enough public sales data is available.
      </div>
    )
  }

  const maxValue = Math.max(
    ...monthly.map((row) => Number(row.median_price_eur || row.avg_price_eur || 0)),
    1
  )
  const latest = monthly[monthly.length - 1]

  return (
    <div className="rounded-[28px] border border-stone-200 bg-white p-5 shadow-sm sm:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-stone-500">
            Monthly movement
          </p>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight text-stone-900">
            Median sale price by month
          </h2>
        </div>
        {latest && (
          <div className="rounded-2xl border border-stone-200 bg-stone-50 px-4 py-3 text-sm">
            <p className="text-stone-500">Latest month</p>
            <p className="mt-1 font-semibold text-stone-900">
              {formatPprCurrency(latest.median_price_eur || latest.avg_price_eur)}
            </p>
          </div>
        )}
      </div>

      <div className="mt-8 flex h-64 items-stretch gap-2 overflow-x-auto pb-2">
        {monthly.map((row) => {
          const value = Number(row.median_price_eur || row.avg_price_eur || 0)
          const height = Math.max(8, Math.round((value / maxValue) * 100))
          const monthLabel = row.year_month
            ? new Intl.DateTimeFormat("en-IE", {
                month: "short",
              }).format(new Date(row.year_month))
            : "—"
          const yearLabel = row.year_month
            ? new Intl.DateTimeFormat("en-IE", {
                year: "2-digit",
              }).format(new Date(row.year_month))
            : ""

          return (
            <div
              key={row.id}
              className="flex h-full min-w-14 flex-1 flex-col items-center gap-2"
              title={`${formatPprDate(row.year_month)}: ${formatPprCurrency(value)}`}
            >
              <div className="flex min-h-0 w-full flex-1 items-end rounded-lg bg-stone-100 px-1.5 pt-2">
                <div
                  className="w-full rounded-t-md bg-stone-900"
                  style={{ height: `${height}%` }}
                />
              </div>
              <div className="text-center text-[11px] leading-4 text-stone-500">
                <span className="block font-medium text-stone-700">
                  {monthLabel}
                </span>
                <span>{yearLabel}</span>
              </div>
            </div>
          )
        })}
      </div>
      <p className="mt-3 text-xs leading-5 text-stone-500">
        Based on public PPR sale prices for months with recorded sales. Months
        without sales are omitted.
      </p>
    </div>
  )
}
