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

  return (
    <div className="rounded-[28px] border border-stone-200 bg-white p-5 shadow-sm sm:p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-stone-500">
            Monthly movement
          </p>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight text-stone-900">
            Median sale price by month
          </h2>
        </div>
      </div>

      <div className="mt-8 flex h-56 items-end gap-2 overflow-x-auto pb-2">
        {monthly.map((row) => {
          const value = Number(row.median_price_eur || row.avg_price_eur || 0)
          const height = Math.max(8, Math.round((value / maxValue) * 100))

          return (
            <div
              key={row.id}
              className="flex min-w-14 flex-1 flex-col items-center justify-end gap-2"
              title={`${formatPprDate(row.year_month)}: ${formatPprCurrency(value)}`}
            >
              <div
                className="w-full rounded-t-md bg-stone-900"
                style={{ height: `${height}%` }}
              />
              <div className="text-center text-[11px] leading-4 text-stone-500">
                {row.year_month
                  ? new Intl.DateTimeFormat("en-IE", {
                      month: "short",
                    }).format(new Date(row.year_month))
                  : "—"}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
