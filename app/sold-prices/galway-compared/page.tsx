import type { Metadata } from "next"
import PprComparisonPageShell from "@/components/ppr/PprComparisonPageShell"
import {
  euroDisplay,
  getGalwayComparisonRows,
  getNationalOverviewSnapshot,
  signedPercent,
} from "@/lib/ppr-analytics"

function definedHighlight<T>(value: T | null): value is T {
  return Boolean(value)
}

export const revalidate = 21600

export const metadata: Metadata = {
  title: "Galway Sold Prices Compared | OpenList",
  description:
    "Compare recorded sale prices across Galway city and surrounding markets, including median prices, yearly change and recent sales volume.",
}

export default async function GalwayComparedPage() {
  const [rows, nationalSnapshot] = await Promise.all([
    getGalwayComparisonRows(),
    getNationalOverviewSnapshot(),
  ])
  const cheapest = [...rows].sort((left, right) => left.medianPrice - right.medianPrice)[0]
  const mostExpensive = [...rows].sort((left, right) => right.medianPrice - left.medianPrice)[0]
  const strongestMover = [...rows]
    .filter((row) => row.yoyChangePct !== undefined)
    .sort((left, right) => (right.yoyChangePct || 0) - (left.yoyChangePct || 0))[0]

  return (
    <PprComparisonPageShell
      eyebrow="Galway comparison"
      title="Galway sold prices compared"
      intro="This view compares curated Galway markets using recorded sales from the last 12 months. It is designed to help sellers compare pricing, momentum and activity across Galway city and nearby markets using the most recent 12-month window."
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
    />
  )
}
