import type { Metadata } from "next"
import PprComparisonPageShell from "@/components/ppr/PprComparisonPageShell"
import {
  euroDisplay,
  getAffordableMarketRows,
  getLowestMedianComparisonRow,
  getMostActiveComparisonRow,
  getNationalOverviewSnapshot,
  numberDisplay,
} from "@/lib/ppr-analytics"

function definedHighlight<T>(value: T | null): value is T {
  return Boolean(value)
}

export const revalidate = 21600

export const metadata: Metadata = {
  title: "Affordable Property Prices Ireland | OpenList",
  description:
    "Find tracked Irish property markets with lower median sale prices, meaningful recent turnover and comparable house-price data.",
  alternates: {
    canonical: "/sold-prices/affordable-markets",
  },
}

export default async function AffordableMarketsPage() {
  const [rows, nationalSnapshot] = await Promise.all([
    getAffordableMarketRows(),
    getNationalOverviewSnapshot(),
  ])
  const cheapest = getLowestMedianComparisonRow(rows)
  const busiest = getMostActiveComparisonRow(rows)
  const priceCapCount = rows.length

  return (
    <PprComparisonPageShell
      eyebrow="Affordable markets"
      title="Affordable property prices in tracked markets"
      intro="This view compares selected markets using recorded sales from the last 12 months. It focuses on areas with a median price below €300k and enough activity to ensure meaningful house-price comparisons."
      highlights={[
        cheapest
          ? {
              label: "Lowest 12-month median",
              value: cheapest.label,
              valueHref: cheapest.href,
              detail: `${euroDisplay(cheapest.medianPrice)} median over the last 12 months.`,
            }
          : null,
        busiest
          ? {
              label: "Busiest affordable market",
              value: busiest.label,
              valueHref: busiest.href,
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
      defaultDirection="asc"
      showRank
      showCounty
    />
  )
}
