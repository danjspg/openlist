import type { Metadata } from "next"
import PprComparisonPageShell from "@/components/ppr/PprComparisonPageShell"
import {
  getClosestToNationalMedianComparisonRow,
  getHighestMedianComparisonRow,
  getLowestMedianComparisonRow,
  getMostActiveComparisonRow,
  getMostActiveMarketRows,
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
  title: "Most Active Property Markets Ireland | Sales Volume",
  description:
    "Compare tracked Irish property markets with the highest recorded sales volume over the last 12 months, alongside median prices and price trends.",
}

export default async function MostActiveMarketsPage() {
  const [rows, nationalSnapshot] = await Promise.all([
    getMostActiveMarketRows(),
    getNationalOverviewSnapshot(),
  ])
  const mostActive = getMostActiveComparisonRow(rows)
  const highestMedian = getHighestMedianComparisonRow(rows)
  const lowestMedian = getLowestMedianComparisonRow(rows)
  const closestToNational = getClosestToNationalMedianComparisonRow(rows)

  return (
    <PprComparisonPageShell
      eyebrow="Most active markets"
      title="Most active property markets"
      intro="This view compares selected markets using recorded sales from the last 12 months. It highlights areas with the highest sales activity, focusing on places with enough volume to support meaningful property-price comparisons."
      highlights={[
        mostActive
          ? {
              label: "Most active",
              value: mostActive.label,
              valueHref: mostActive.href,
              detail: `${numberDisplay(mostActive.salesVolume)} recorded sales in the last 12 months.`,
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
      showRank
      showCounty
    />
  )
}
