import type { Metadata } from "next"
import PprComparisonPageShell from "@/components/ppr/PprComparisonPageShell"
import {
  euroDisplay,
  getDublinComparisonRows,
  getNationalOverviewSnapshot,
  numberDisplay,
  signedPercent,
} from "@/lib/ppr-analytics"

function definedHighlight<T>(value: T | null): value is T {
  return Boolean(value)
}

export const revalidate = 21600

export const metadata: Metadata = {
  title: "Dublin Sold Prices Compared | OpenList",
  description:
    "Compare recorded sale prices across Dublin districts and suburbs, including median prices, yearly change and recent sales volume.",
}

export default async function DublinComparedPage() {
  const [rows, nationalSnapshot] = await Promise.all([
    getDublinComparisonRows(),
    getNationalOverviewSnapshot(),
  ])
  const cheapest = [...rows].sort((left, right) => left.medianPrice - right.medianPrice)[0]
  const mostExpensive = [...rows].sort((left, right) => right.medianPrice - left.medianPrice)[0]
  const mostActive = [...rows].sort((left, right) => right.salesVolume - left.salesVolume)[0]
  const spreadPct =
    cheapest && mostExpensive && cheapest.medianPrice > 0
      ? ((mostExpensive.medianPrice - cheapest.medianPrice) / cheapest.medianPrice) * 100
      : undefined

  return (
    <PprComparisonPageShell
      eyebrow="Dublin comparison"
      title="Dublin sold prices compared"
      intro="This view compares Dublin districts and tracked suburbs using recorded sales from the last 12 months. It is designed to help sellers compare pricing, momentum and activity across Dublin markets using the most recent 12-month window."
      highlights={[
        cheapest
          ? {
              label: "Cheapest tracked market",
              value: cheapest.label,
              detail: `${euroDisplay(cheapest.medianPrice)} median over the last 12 months.`,
            }
          : null,
        mostExpensive
          ? {
              label: "Most expensive tracked market",
              value: mostExpensive.label,
              detail: `${euroDisplay(mostExpensive.medianPrice)} median${spreadPct !== undefined && cheapest ? `, ${signedPercent(spreadPct)} above ${cheapest.label}` : ""}.`,
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
