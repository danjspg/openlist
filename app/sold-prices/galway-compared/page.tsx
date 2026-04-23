import type { Metadata } from "next"
import PprComparisonPageShell from "@/components/ppr/PprComparisonPageShell"
import {
  euroDisplay,
  getGalwayComparisonRows,
  getHighestMedianComparisonRow,
  getHighestYoYComparisonRow,
  getLowestMedianComparisonRow,
  getNationalOverviewSnapshot,
  signedPercent,
} from "@/lib/ppr-analytics"

function definedHighlight<T>(value: T | null): value is T {
  return Boolean(value)
}

export const revalidate = 21600

export const metadata: Metadata = {
  title: "Galway House Prices by Area | Sold Prices Compared",
  description:
    "Compare Galway house prices by area, including median sale prices, price change and recent sales volume.",
}

export default async function GalwayComparedPage() {
  const [rows, nationalSnapshot] = await Promise.all([
    getGalwayComparisonRows(),
    getNationalOverviewSnapshot(),
  ])
  const cheapest = getLowestMedianComparisonRow(rows)
  const mostExpensive = getHighestMedianComparisonRow(rows)
  const strongestMover = getHighestYoYComparisonRow(rows)

  return (
    <PprComparisonPageShell
      eyebrow="Galway comparison"
      title="Galway house prices by area"
      intro="This view compares curated Galway markets using recorded sales from the last 12 months. It is designed to help you compare house prices, momentum and activity across Galway city and nearby markets using the most recent 12-month window."
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
        strongestMover
          ? {
              label: "Strongest recent mover",
              value: strongestMover.label,
              detail: `${signedPercent(strongestMover.yoyChangePct)} year on year from recorded sales.`,
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
