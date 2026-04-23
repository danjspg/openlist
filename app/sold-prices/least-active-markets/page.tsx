import type { Metadata } from "next"
import PprComparisonPageShell from "@/components/ppr/PprComparisonPageShell"
import {
  getClosestToNationalMedianComparisonRow,
  getHighestMedianComparisonRow,
  getLeastActiveComparisonRow,
  getLeastActiveMarketRows,
  getLowestMedianComparisonRow,
  getNationalOverviewSnapshot,
  euroDisplay,
  numberDisplay,
  signedPercent,
} from "@/lib/ppr-analytics"

function definedHighlight<T>(value: T | null): value is T {
  return Boolean(value)
}

export const revalidate = 21600

export const metadata: Metadata = {
  title: "Least Active Property Markets Ireland | Sales Volume",
  description:
    "Compare tracked Irish property markets with lower recorded sales volume over the last 12 months, while keeping meaningful house-price context.",
}

export default async function LeastActiveMarketsPage() {
  const [rows, nationalSnapshot] = await Promise.all([
    getLeastActiveMarketRows(),
    getNationalOverviewSnapshot(),
  ])
  const leastActive = getLeastActiveComparisonRow(rows)
  const highestMedian = getHighestMedianComparisonRow(rows)
  const lowestMedian = getLowestMedianComparisonRow(rows)
  const closestToNational = getClosestToNationalMedianComparisonRow(rows)

  return (
    <PprComparisonPageShell
      eyebrow="Least active markets"
      title="Least active property markets"
      intro="This view compares selected markets using recorded sales from the last 12 months. It highlights areas with lower sales activity, focusing on places with enough volume to support meaningful property-price comparisons."
      highlights={[
        leastActive
          ? {
              label: "Least active",
              value: leastActive.label,
              valueHref: leastActive.href,
              detail: `${numberDisplay(leastActive.salesVolume)} recorded sales in the last 12 months.`,
            }
          : null,
        highestMedian
          ? {
              label: "Highest median",
              value: highestMedian.label,
              valueHref: highestMedian.href,
              detail: `${euroDisplay(highestMedian.medianPrice)} median over the last 12 months.`,
            }
          : null,
        lowestMedian
          ? {
              label: "Lowest median",
              value: lowestMedian.label,
              valueHref: lowestMedian.href,
              detail: `${euroDisplay(lowestMedian.medianPrice)} median over the last 12 months.`,
            }
          : null,
        closestToNational
          ? {
              label: "Closest to national median",
              value: closestToNational.label,
              valueHref: closestToNational.href,
              detail: `${signedPercent(closestToNational.vsNationalMedianPct)} versus the national 12-month median.`,
            }
          : null,
      ].filter(definedHighlight)}
      rows={rows}
      nationalMedian={nationalSnapshot.medianPrice}
      nationalYoYChangePct={nationalSnapshot.yoyChangePct}
      defaultSort="salesVolume"
      defaultDirection="asc"
      showRank
      showCounty
    />
  )
}
