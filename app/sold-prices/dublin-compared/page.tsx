import type { Metadata } from "next"
import PprComparisonPageShell from "@/components/ppr/PprComparisonPageShell"
import {
  euroDisplay,
  getDublinComparisonRows,
  getHighestMedianComparisonRow,
  getLowestMedianComparisonRow,
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
  title: "Dublin House Prices by Area | Sold Prices Compared",
  description:
    "Compare Dublin house prices by area, including median sale prices, price change, activity and recent sales volume.",
  alternates: {
    canonical: "/sold-prices/dublin-compared",
  },
}

export default async function DublinComparedPage() {
  const [rows, nationalSnapshot] = await Promise.all([
    getDublinComparisonRows(),
    getNationalOverviewSnapshot(),
  ])
  const cheapest = getLowestMedianComparisonRow(rows)
  const mostExpensive = getHighestMedianComparisonRow(rows)
  const mostActive = getMostActiveComparisonRow(rows)
  const spreadPct =
    cheapest && mostExpensive && cheapest.medianPrice > 0
      ? ((mostExpensive.medianPrice - cheapest.medianPrice) / cheapest.medianPrice) * 100
      : undefined

  return (
    <PprComparisonPageShell
      eyebrow="Dublin comparison"
      title="Dublin house prices by area"
      intro="This view compares Dublin districts and tracked suburbs using recorded sales from the last 12 months. It is designed to help you compare house prices, momentum and activity across Dublin markets using the most recent 12-month window."
      highlights={[
        cheapest
          ? {
              label: "Cheapest tracked market",
              value: cheapest.label,
              valueHref: cheapest.href,
              detail: `${euroDisplay(cheapest.medianPrice)} median over the last 12 months.`,
            }
          : null,
        mostExpensive
          ? {
              label: "Most expensive tracked market",
              value: mostExpensive.label,
              valueHref: mostExpensive.href,
              detail: `${euroDisplay(mostExpensive.medianPrice)} median${spreadPct !== undefined && cheapest ? `, ${signedPercent(spreadPct)} above ${cheapest.label}` : ""}.`,
            }
          : null,
        mostActive
          ? {
              label: "Most active market",
              value: mostActive.label,
              valueHref: mostActive.href,
              detail: `${numberDisplay(mostActive.salesVolume)} recorded sales in the last 12 months.`,
            }
          : null,
      ].filter(definedHighlight)}
      rows={rows}
      nationalMedian={nationalSnapshot.medianPrice}
      nationalYoYChangePct={nationalSnapshot.yoyChangePct}
      defaultSort="medianPrice"
      showRank
      extraColumn={{
        key: "activityChangePct",
        label: "Activity YoY",
        mobileLabel: "Activity YoY",
        format: "pct",
      }}
    />
  )
}
