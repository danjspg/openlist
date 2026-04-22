import type { Metadata } from "next"
import PprComparisonPageShell from "@/components/ppr/PprComparisonPageShell"
import {
  euroDisplay,
  getAffordableMarketRows,
  getNationalOverviewSnapshot,
  numberDisplay,
} from "@/lib/ppr-analytics"

function definedHighlight<T>(value: T | null): value is T {
  return Boolean(value)
}

export const revalidate = 21600

export const metadata: Metadata = {
  title: "Affordable Property Markets Ireland | OpenList",
  description:
    "Find tracked Irish property markets with lower recorded median sale prices and meaningful recent transaction volume.",
}

export default async function AffordableMarketsPage() {
  const [rows, nationalSnapshot] = await Promise.all([
    getAffordableMarketRows(),
    getNationalOverviewSnapshot(),
  ])
  const cheapest = rows[0]
  const busiest = [...rows].sort((left, right) => right.salesVolume - left.salesVolume)[0]
  const priceCapCount = rows.length

  return (
    <PprComparisonPageShell
      eyebrow="Affordable markets"
      title="Affordable markets with real turnover"
      intro="This view compares selected markets using recorded sales from the last 12 months. It focuses on areas with a median price below €300k and enough activity to ensure meaningful comparisons."
      highlights={[
        cheapest
          ? {
              label: "Lowest 12-month median",
              value: cheapest.label,
              detail: `${euroDisplay(cheapest.medianPrice)} median over the last 12 months.`,
            }
          : null,
        busiest
          ? {
              label: "Busiest affordable market",
              value: busiest.label,
              detail: `${numberDisplay(busiest.salesVolume)} recorded sales in the last 12 months.`,
            }
          : null,
        {
          label: "Markets shown",
          value: numberDisplay(priceCapCount),
          detail: "Tracked locations under the affordability threshold with a meaningful sales base.",
        },
      ].filter(definedHighlight)}
      rows={rows}
      nationalMedian={nationalSnapshot.medianPrice}
      nationalYoYChangePct={nationalSnapshot.yoyChangePct}
      defaultSort="medianPrice"
    />
  )
}
