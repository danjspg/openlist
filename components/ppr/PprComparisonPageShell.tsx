import PprComparisonTable from "@/components/ppr/PprComparisonTable"
import { euroDisplay, signedPercent, type PprComparisonRow } from "@/lib/ppr-analytics"

function toneClass(value?: number) {
  if (value === undefined) return "text-stone-900"
  if (value > 0) return "text-emerald-700"
  if (value < 0) return "text-rose-700"
  return "text-stone-900"
}

export default function PprComparisonPageShell({
  eyebrow,
  title,
  intro,
  highlights,
  rows,
  nationalMedian,
  nationalYoYChangePct,
  defaultSort,
  defaultDirection,
  extraColumn,
  footnote,
}: {
  eyebrow: string
  title: string
  intro: string
  highlights: Array<{ label: string; value: string; detail: string }>
  rows: PprComparisonRow[]
  nationalMedian?: number
  nationalYoYChangePct?: number
  defaultSort?: Parameters<typeof PprComparisonTable>[0]["defaultSort"]
  defaultDirection?: Parameters<typeof PprComparisonTable>[0]["defaultDirection"]
  extraColumn?: Parameters<typeof PprComparisonTable>[0]["extraColumn"]
  footnote?: string
}) {
  return (
    <main className="min-h-screen bg-stone-50">
      <section className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
        <div className="overflow-hidden rounded-[32px] border border-stone-200 bg-white shadow-sm">
          <div className="bg-gradient-to-br from-stone-50 via-white to-stone-100 px-5 py-7 sm:px-8 md:px-10 md:py-10">
            <p className="text-sm font-medium uppercase tracking-[0.24em] text-stone-500">
              {eyebrow}
            </p>
            <h1 className="mt-2 max-w-4xl text-4xl font-semibold tracking-tight text-stone-900 sm:text-5xl">
              {title}
            </h1>
            <p className="mt-5 max-w-3xl text-base leading-7 text-stone-600 sm:text-lg sm:leading-8">
              {intro}
            </p>
            <div className="mt-6 rounded-[22px] border border-stone-200 bg-white/80 px-4 py-4 text-sm leading-6 text-stone-600">
              Detailed sold-prices search is being updated. Use the tracked market pages and
              comparison views below in the meantime.
            </div>
            <div className="mt-6 inline-flex rounded-full border border-stone-200 bg-white/80 px-4 py-2 text-sm font-medium text-stone-600">
              Snapshot: Last 12 months
            </div>
          </div>
        </div>

        {highlights.length > 0 && (
          <div className="mt-8 grid gap-4 md:grid-cols-3">
            {highlights.map((highlight) => (
              <div
                key={`${highlight.label}-${highlight.value}`}
                className="rounded-[24px] border border-stone-200 bg-white p-5 shadow-sm"
              >
                <p className="text-sm text-stone-500">{highlight.label}</p>
                <p className="mt-2 text-2xl font-semibold tracking-tight text-stone-900">
                  {highlight.value}
                </p>
                <p className="mt-2 text-sm leading-6 text-stone-600">{highlight.detail}</p>
              </div>
            ))}
          </div>
        )}

        <div className="mt-8">
          {nationalMedian !== undefined && (
            <div className="mb-4 rounded-[24px] border border-stone-200 bg-white px-5 py-4 shadow-sm">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-medium uppercase tracking-[0.18em] text-stone-500">
                    National median
                  </p>
                  <p className="mt-2 text-sm leading-6 text-stone-600">
                    Based on recorded sales across Ireland in the last 12 months.
                  </p>
                </div>
                <div className="sm:text-right">
                  <p className="text-2xl font-semibold tracking-tight text-stone-900">
                    {euroDisplay(nationalMedian)}
                  </p>
                  {nationalYoYChangePct !== undefined && (
                    <p className={`mt-1 text-sm font-medium ${toneClass(nationalYoYChangePct)}`}>
                      {signedPercent(nationalYoYChangePct)} vs previous 12 months
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}
          <PprComparisonTable
            rows={rows}
            defaultSort={defaultSort}
            defaultDirection={defaultDirection}
            extraColumn={extraColumn}
          />
        </div>

        <p className="mt-4 text-sm leading-6 text-stone-500">
          Rankings are based on recorded sale prices only. Markets with limited samples are filtered
          out so small datasets do not dominate the comparisons.
        </p>
        {footnote && <p className="mt-2 text-sm leading-6 text-stone-500">{footnote}</p>}
      </section>
    </main>
  )
}
