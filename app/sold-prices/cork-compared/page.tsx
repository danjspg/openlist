import type { Metadata } from "next"
import PprComparisonPageShell from "@/components/ppr/PprComparisonPageShell"
import {
  euroDisplay,
  getCorkComparisonRows,
  getNationalOverviewSnapshot,
  signedPercent,
} from "@/lib/ppr-analytics"

function definedHighlight<T>(value: T | null): value is T {
  return Boolean(value)
}

export const revalidate = 21600

export const metadata: Metadata = {
  title: "Cork Sold Prices Compared | OpenList",
  description:
    "Compare recorded sale prices across Cork city and commuter markets, with medians, year-on-year changes and sales volumes.",
}

export default async function CorkComparedPage() {
  const [rows, nationalSnapshot] = await Promise.all([
    getCorkComparisonRows(),
    getNationalOverviewSnapshot(),
  ])
  const cheapest = rows[0]
  const mostExpensive = [...rows].sort((left, right) => right.medianPrice - left.medianPrice)[0]
  const strongestMover = [...rows]
    .filter((row) => row.yoyChangePct !== undefined)
    .sort((left, right) => (right.yoyChangePct || 0) - (left.yoyChangePct || 0))[0]

  return (
    <PprComparisonPageShell
      eyebrow="Cork comparison"
      title="Cork sold prices compared"
      intro="This view compares tracked Cork markets using recorded sales from the last 12 months. It is designed to help sellers compare pricing, momentum and activity across Cork markets using the most recent 12-month window."
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
