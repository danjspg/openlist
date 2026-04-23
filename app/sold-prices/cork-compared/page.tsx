import type { Metadata } from "next"
import PprComparisonPageShell from "@/components/ppr/PprComparisonPageShell"
import {
  euroDisplay,
  getHighestMedianComparisonRow,
  getHighestYoYComparisonRow,
  getCorkComparisonRows,
  getLowestMedianComparisonRow,
  getNationalOverviewSnapshot,
  signedPercent,
} from "@/lib/ppr-analytics"

function definedHighlight<T>(value: T | null): value is T {
  return Boolean(value)
}

export const revalidate = 21600

export const metadata: Metadata = {
  title: "Cork House Prices by Area | Sold Prices Compared",
  description:
    "Compare Cork house prices by area, with median sale prices, price change, activity and recent sales volume.",
}

export default async function CorkComparedPage() {
  const [rows, nationalSnapshot] = await Promise.all([
    getCorkComparisonRows(),
    getNationalOverviewSnapshot(),
  ])
  const cheapest = getLowestMedianComparisonRow(rows)
  const mostExpensive = getHighestMedianComparisonRow(rows)
  const strongestMover = getHighestYoYComparisonRow(rows)

  return (
    <PprComparisonPageShell
      eyebrow="Cork comparison"
      title="Cork house prices by area"
      intro="This view compares tracked Cork markets using recorded sales from the last 12 months. It is designed to help you compare house prices, momentum and activity across Cork markets using the most recent 12-month window."
      highlights={[
        cheapest
          ? {
              label: "Lowest median",
              value: cheapest.label,
              valueHref: cheapest.href,
              detail: `${euroDisplay(cheapest.medianPrice)} median over the last 12 months.`,
            }
          : null,
        mostExpensive
          ? {
              label: "Highest median",
              value: mostExpensive.label,
              valueHref: mostExpensive.href,
              detail: `${euroDisplay(mostExpensive.medianPrice)} median in the last 12 months.`,
            }
          : null,
        strongestMover
          ? {
              label: "Strongest recent mover",
              value: strongestMover.label,
              valueHref: strongestMover.href,
              detail: `${signedPercent(strongestMover.yoyChangePct)} year on year from recorded sales.`,
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
