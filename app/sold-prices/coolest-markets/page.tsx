import type { Metadata } from "next"
import PprComparisonPageShell from "@/components/ppr/PprComparisonPageShell"
import {
  euroDisplay,
  getCoolestMarketRows,
  getHighestMedianComparisonRow,
  getLowestActivityChangeComparisonRow,
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
  title: "Coolest Property Markets Ireland | Price and Activity",
  description:
    "Compare tracked Irish property markets where sales activity has weakened and prices have been flat or lower over the last 12 months.",
  alternates: {
    canonical: "/sold-prices/coolest-markets",
  },
}

export default async function CoolestMarketsPage() {
  const [rows, nationalSnapshot] = await Promise.all([
    getCoolestMarketRows(),
    getNationalOverviewSnapshot(),
  ])
  const coolest = getLowestActivityChangeComparisonRow(rows)
  const mostActive = getMostActiveComparisonRow(rows)
  const highestMedian = getHighestMedianComparisonRow(rows)

  return (
    <PprComparisonPageShell
      eyebrow="Coolest markets"
      title="Coolest property markets"
      intro="This view highlights selected markets where sales activity has weakened and prices have been flat or lower over the last 12 months."
      highlights={[
        coolest
          ? {
              label: "Coolest market",
              value: coolest.label,
              valueHref: coolest.href,
              detail: `${signedPercent(coolest.activityChangePct)} activity change year on year from ${numberDisplay(coolest.previousPeriodCount || 0)} to ${numberDisplay(coolest.currentPeriodCount || 0)} sales.`,
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
      defaultDirection="asc"
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
