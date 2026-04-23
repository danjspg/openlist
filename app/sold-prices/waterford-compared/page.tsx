import type { Metadata } from "next"
import PprComparisonPageShell from "@/components/ppr/PprComparisonPageShell"
import {
  euroDisplay,
  getHighestMedianComparisonRow,
  getLowestMedianComparisonRow,
  getMostActiveComparisonRow,
  getNationalOverviewSnapshot,
  getWaterfordComparisonRows,
  numberDisplay,
} from "@/lib/ppr-analytics"

function definedHighlight<T>(value: T | null): value is T {
  return Boolean(value)
}

export const revalidate = 21600

export const metadata: Metadata = {
  title: "Waterford House Prices by Area | Sold Prices Compared",
  description:
    "Compare Waterford house prices by area, including median sale prices, price change, activity and recent sales volume.",
}

export default async function WaterfordComparedPage() {
  const [rows, nationalSnapshot] = await Promise.all([
    getWaterfordComparisonRows(),
    getNationalOverviewSnapshot(),
  ])
  const cheapest = getLowestMedianComparisonRow(rows)
  const mostExpensive = getHighestMedianComparisonRow(rows)
  const mostActive = getMostActiveComparisonRow(rows)

  return (
    <PprComparisonPageShell
      eyebrow="Waterford comparison"
      title="Waterford house prices by area"
      intro="This view compares curated Waterford markets using recorded sales from the last 12 months. It is designed to help you compare house prices, momentum and activity across Waterford city and nearby markets using the most recent 12-month window."
      highlights={[
        cheapest
          ? {
              label: "Lowest median",
              value: cheapest.label,
              detail: `${euroDisplay(cheapest.medianPrice)} median over the last 12 months.`,
            }
          : null,
        mostExpensive
          ? {
              label: "Highest median",
              value: mostExpensive.label,
              detail: `${euroDisplay(mostExpensive.medianPrice)} median in the last 12 months.`,
            }
          : null,
        mostActive
          ? {
              label: "Most active market",
              value: mostActive.label,
              detail: `${numberDisplay(mostActive.salesVolume)} recorded sales in the last 12 months.`,
            }
          : null,
      ].filter(definedHighlight)}
      rows={rows}
      nationalMedian={nationalSnapshot.medianPrice}
      nationalYoYChangePct={nationalSnapshot.yoyChangePct}
      defaultSort="medianPrice"
      extraColumn={{
        key: "activityChangePct",
        label: "Activity YoY",
        mobileLabel: "Activity YoY",
        format: "pct",
      }}
    />
  )
}
