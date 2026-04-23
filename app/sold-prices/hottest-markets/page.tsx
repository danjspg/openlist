import type { Metadata } from "next"
import PprComparisonPageShell from "@/components/ppr/PprComparisonPageShell"
import {
  euroDisplay,
  getHighestActivityChangeComparisonRow,
  getHighestMedianComparisonRow,
  getHottestMarketRows,
  getMostActiveComparisonRow,
  getNationalOverviewSnapshot,
  numberDisplay,
  signedPercent,
} from "@/lib/ppr-analytics"

function definedHighlight<T>(value: T | null): value is T {
  return Boolean(value)
}

export const revalidate = 21600

export const metadata: Metadata = {
  title: "Hottest Property Markets Ireland | Price and Activity",
  description:
    "Compare tracked Irish property markets where both sales activity and prices have risen over the last 12 months.",
}

export default async function HottestMarketsPage() {
  const [rows, nationalSnapshot] = await Promise.all([
    getHottestMarketRows(),
    getNationalOverviewSnapshot(),
  ])
  const hottest = getHighestActivityChangeComparisonRow(rows)
  const mostActive = getMostActiveComparisonRow(rows)
  const highestMedian = getHighestMedianComparisonRow(rows)

  return (
    <PprComparisonPageShell
      eyebrow="Hottest markets"
      title="Hottest property markets"
      intro="This view highlights selected markets where both sales activity and prices have risen over the last 12 months."
      highlights={[
        hottest
          ? {
              label: "Hottest market",
              value: hottest.label,
              valueHref: hottest.href,
              detail: `${signedPercent(hottest.activityChangePct)} activity change year on year from ${numberDisplay(hottest.previousPeriodCount || 0)} to ${numberDisplay(hottest.currentPeriodCount || 0)} sales.`,
            }
          : null,
        mostActive
          ? {
              label: "Largest sample in the set",
              value: mostActive.label,
              valueHref: mostActive.href,
              detail: `${numberDisplay(mostActive.salesVolume)} recorded sales in the last 12 months.`,
            }
          : null,
        highestMedian
          ? {
              label: "Highest median in the set",
              value: highestMedian.label,
              valueHref: highestMedian.href,
              detail: `${euroDisplay(highestMedian.medianPrice)} median over the last 12 months.`,
            }
          : null,
      ].filter(definedHighlight)}
      rows={rows}
      nationalMedian={nationalSnapshot.medianPrice}
      nationalYoYChangePct={nationalSnapshot.yoyChangePct}
      defaultSort="activityChangePct"
      extraColumn={{
        key: "activityChangePct",
        label: "Activity change",
        mobileLabel: "Activity",
        format: "pct",
      }}
      showRank
      showCounty
    />
  )
}
