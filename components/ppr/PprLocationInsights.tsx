"use client"

import {
  euroDisplay,
  numberDisplay,
  signedPercent,
  type PprLocationInsights,
} from "@/lib/ppr-analytics"

function toneClass(value?: number) {
  if (value === undefined) return "text-stone-900"
  if (value > 0) return "text-emerald-700"
  if (value < 0) return "text-rose-700"
  return "text-stone-900"
}

function activityChangeLabel(value?: number) {
  if (value === undefined) return null
  if (value > 0) return `↑ ${signedPercent(value)}`
  if (value < 0) return `↓ ${signedPercent(value)}`
  return "No change"
}

export default function PprLocationInsights({
  areaLabel,
  insights,
  rangeLabel,
  compact = false,
}: {
  areaLabel: string
  insights: PprLocationInsights
  rangeLabel: string
  compact?: boolean
}) {
  const hasReliableActivityComparison = Boolean(insights.activity?.hasReliableChange)
  const activityChange = insights.activity?.changePct

  const cards = [
    {
      key: "momentum",
      show: Boolean(insights.momentum),
      title: "Price momentum",
      body: insights.momentum ? (
        <>
          <div className="flex flex-wrap items-end gap-3">
            <p className="text-3xl font-semibold tracking-tight text-stone-900">
              {signedPercent(insights.momentum.yoyChangePct)}
            </p>
            <p className={`text-sm font-medium ${toneClass(insights.momentum.yoyChangePct)}`}>
              vs the previous 12 months
            </p>
          </div>
          <div className="mt-4 grid gap-3 text-sm text-stone-600 sm:grid-cols-2">
            <div className="rounded-2xl border border-stone-200 bg-stone-50 px-4 py-3">
              <p className="text-xs uppercase tracking-[0.18em] text-stone-500">
                {insights.momentum.currentLabel}
              </p>
              <p className="mt-1 text-lg font-semibold text-stone-900">
                {euroDisplay(insights.momentum.currentMedian)}
              </p>
            </div>
            <div className="rounded-2xl border border-stone-200 bg-stone-50 px-4 py-3">
              <p className="text-xs uppercase tracking-[0.18em] text-stone-500">
                {insights.momentum.previousLabel}
              </p>
              <p className="mt-1 text-lg font-semibold text-stone-900">
                {euroDisplay(insights.momentum.previousMedian)}
              </p>
            </div>
          </div>
          {insights.momentum.threeYearChangePct !== undefined && (
            <p className="mt-4 text-sm leading-6 text-stone-600">
              Recorded sale prices in {areaLabel} are{" "}
              <span className={`font-semibold ${toneClass(insights.momentum.threeYearChangePct)}`}>
                {signedPercent(insights.momentum.threeYearChangePct)}
              </span>{" "}
              over 3 years.
            </p>
          )}
        </>
      ) : null,
    },
    {
      key: "activity",
      show: Boolean(insights.activity),
      title: "Market activity",
      body: insights.activity ? (
        <>
          {hasReliableActivityComparison ? (
            <>
              <p
                className={`text-3xl font-semibold tracking-tight ${toneClass(
                  activityChange
                )}`}
              >
                {activityChangeLabel(activityChange)}
              </p>
              <p className="mt-3 text-sm leading-6 text-stone-600">
                {insights.activity.currentPeriodLabel} vs{" "}
                {insights.activity.previousPeriodLabel}
              </p>
              {insights.activity.currentPeriodCount !== undefined &&
                insights.activity.previousPeriodCount !== undefined && (
                  <p className="text-sm leading-6 text-stone-500">
                    {numberDisplay(insights.activity.currentPeriodCount)} vs{" "}
                    {numberDisplay(insights.activity.previousPeriodCount)} recorded sales
                  </p>
                )}
            </>
          ) : (
            <>
              <p className="text-2xl font-semibold tracking-tight text-stone-900">
                Limited activity data
              </p>
              <p className="mt-3 text-sm leading-6 text-stone-600">
                {numberDisplay(insights.activity.currentPeriodCount)} sales in the{" "}
                {insights.activity.currentPeriodLabel.toLowerCase()}.
              </p>
              <p className="text-sm leading-6 text-stone-500">
                Not enough recent sales for a reliable activity comparison.
              </p>
            </>
          )}
          {!hasReliableActivityComparison &&
            insights.activity.averageDaysBetweenSales !== undefined && (
            <p className="mt-4 text-sm leading-6 text-stone-600">
              Across {rangeLabel}, sales were recorded roughly every{" "}
              <span className="font-semibold text-stone-900">
                {numberDisplay(insights.activity.averageDaysBetweenSales)} days
              </span>
              .
            </p>
          )}
          {!hasReliableActivityComparison && insights.activity.peakMonthName && (
            <p className="mt-4 text-sm leading-6 text-stone-600">
              Sales in {areaLabel} most often peak in{" "}
              <span className="font-semibold text-stone-900">
                {insights.activity.peakMonthName}
              </span>
              .
            </p>
          )}
        </>
      ) : null,
    },
    {
      key: "distribution",
      show: Boolean(insights.distribution),
      title: "Price distribution",
      body: insights.distribution ? (
        <>
          <p className="text-sm leading-6 text-stone-600">
            Most homes in {areaLabel} sold between{" "}
            <span className="font-semibold text-stone-900">
              {euroDisplay(insights.distribution.p25)}
            </span>{" "}
            and{" "}
            <span className="font-semibold text-stone-900">
              {euroDisplay(insights.distribution.p75)}
            </span>{" "}
            across {rangeLabel}.
          </p>
          {insights.distribution.thresholdShares.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-2">
              {insights.distribution.thresholdShares.map((threshold) => (
                <span
                  key={threshold.threshold}
                  className="rounded-full border border-stone-200 bg-stone-50 px-3 py-1 text-xs font-medium text-stone-600"
                >
                  {threshold.sharePct}% above {euroDisplay(threshold.threshold)}
                </span>
              ))}
            </div>
          )}
        </>
      ) : null,
    },
    {
      key: "split",
      show: Boolean(insights.buildSplit),
      title: "New build vs second-hand",
      body: insights.buildSplit ? (
        <>
          <div className="grid gap-3 text-sm text-stone-600 sm:grid-cols-2">
            <div className="rounded-2xl border border-stone-200 bg-stone-50 px-4 py-3">
              <p className="text-xs uppercase tracking-[0.18em] text-stone-500">New build median</p>
              <p className="mt-1 text-lg font-semibold text-stone-900">
                {euroDisplay(insights.buildSplit.newBuildMedian)}
              </p>
            </div>
            <div className="rounded-2xl border border-stone-200 bg-stone-50 px-4 py-3">
              <p className="text-xs uppercase tracking-[0.18em] text-stone-500">
                Second-hand median
              </p>
              <p className="mt-1 text-lg font-semibold text-stone-900">
                {euroDisplay(insights.buildSplit.secondHandMedian)}
              </p>
            </div>
          </div>
          <p className="mt-4 text-sm leading-6 text-stone-600">
            New-build homes sold for{" "}
            <span className={`font-semibold ${toneClass(insights.buildSplit.premiumAmount)}`}>
              {euroDisplay(Math.abs(insights.buildSplit.premiumAmount))}
            </span>{" "}
            {insights.buildSplit.premiumAmount >= 0 ? "more" : "less"} on median across {rangeLabel}.
          </p>
        </>
      ) : null,
    },
  ].filter((card) => card.show)

  if (cards.length === 0) {
    return null
  }

  return (
    <div className={compact ? "grid gap-4" : "grid gap-4 md:grid-cols-2"}>
      {cards.map((card) => (
        <section
          key={card.key}
          className="rounded-[28px] border border-stone-200 bg-white p-5 shadow-sm sm:p-6"
        >
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-stone-500">
            {card.title}
          </p>
          <div className="mt-4">{card.body}</div>
        </section>
      ))}
    </div>
  )
}
