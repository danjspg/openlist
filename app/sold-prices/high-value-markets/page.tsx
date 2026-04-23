import type { Metadata } from "next"
import PprComparisonPageShell from "@/components/ppr/PprComparisonPageShell"
import {
  euroDisplay,
  getHighValueMarketRows,
  getHighestMedianComparisonRow,
  getMostActiveComparisonRow,
  getNationalOverviewSnapshot,
  numberDisplay,
} from "@/lib/ppr-analytics"

function definedHighlight<T>(value: T | null): value is T {
  return Boolean(value)
}

export const revalidate = 21600

export const metadata: Metadata = {
  title: "Premium Property Markets Ireland | OpenList",
  description:
    "Compare tracked Irish property markets with higher recorded median sale prices and meaningful recent transaction volume.",
}

export default async function HighValueMarketsPage() {
  const [rows, nationalSnapshot] = await Promise.all([
    getHighValueMarketRows(),
    getNationalOverviewSnapshot(),
  ])
  const highest = getHighestMedianComparisonRow(rows)
  const busiest = getMostActiveComparisonRow(rows)
  const marketCount = rows.length

  return (
    <PprComparisonPageShell
      eyebrow="Premium markets"
      title="Premium markets with real turnover"
      intro="This view compares selected markets using recorded sales from the last 12 months. It focuses on areas with a median price above €500k and enough activity to ensure meaningful comparisons."
      highlights={[
        highest
          ? {
              label: "Highest 12-month median",
              value: highest.label,
              detail: `${euroDisplay(highest.medianPrice)} median over the last 12 months.`,
            }
          : null,
        busiest
          ? {
              label: "Busiest premium market",
              value: busiest.label,
              detail: `${numberDisplay(busiest.salesVolume)} recorded sales in the last 12 months.`,
            }
          : null,
        {
          label: "Markets shown",
          value: numberDisplay(marketCount),
          detail: "Tracked locations above the high-value threshold with a meaningful sales base.",
        },
      ].filter(definedHighlight)}
      rows={rows}
      nationalMedian={nationalSnapshot.medianPrice}
      nationalYoYChangePct={nationalSnapshot.yoyChangePct}
      defaultSort="medianPrice"
    />
  )
}
