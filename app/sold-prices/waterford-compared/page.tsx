import type { Metadata } from "next"
import PprComparisonPageShell from "@/components/ppr/PprComparisonPageShell"
import {
  euroDisplay,
  getNationalOverviewSnapshot,
  getWaterfordComparisonRows,
  numberDisplay,
} from "@/lib/ppr-analytics"

function definedHighlight<T>(value: T | null): value is T {
  return Boolean(value)
}

export const revalidate = 21600

export const metadata: Metadata = {
  title: "Waterford Sold Prices Compared | OpenList",
  description:
    "Compare recorded sale prices across Waterford city and surrounding markets, including median prices, yearly change and recent sales volume.",
}

export default async function WaterfordComparedPage() {
  const [rows, nationalSnapshot] = await Promise.all([
    getWaterfordComparisonRows(),
    getNationalOverviewSnapshot(),
  ])
  const cheapest = [...rows].sort((left, right) => left.medianPrice - right.medianPrice)[0]
  const mostExpensive = [...rows].sort((left, right) => right.medianPrice - left.medianPrice)[0]
  const mostActive = [...rows].sort((left, right) => right.salesVolume - left.salesVolume)[0]

  return (
    <PprComparisonPageShell
      eyebrow="Waterford comparison"
      title="Waterford sold prices compared"
      intro="This view compares curated Waterford markets using recorded sales from the last 12 months. It is designed to help sellers compare pricing, momentum and activity across Waterford city and nearby markets using the most recent 12-month window."
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
    />
  )
}
