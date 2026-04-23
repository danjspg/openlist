import type { Metadata } from "next"
import PprComparisonPageShell from "@/components/ppr/PprComparisonPageShell"
import {
  euroDisplay,
  getFallingMarketRows,
  getHighestMedianComparisonRow,
  getLowestYoYComparisonRow,
  getMostActiveComparisonRow,
  getNationalOverviewSnapshot,
  numberDisplay,
  signedPercent,
} from "@/lib/ppr-analytics"

function definedHighlight<T>(value: T | null): value is T {
  return Boolean(value)
}

export const revalidate = 21600

export const metadata: Metadata = {
  title: "Falling Property Prices Ireland | OpenList",
  description:
    "See the tracked Irish property markets with the weakest year-on-year house-price performance, filtered to avoid thin-sample noise.",
}

export default async function FallingMarketsPage() {
  const [rows, nationalSnapshot] = await Promise.all([
    getFallingMarketRows(),
    getNationalOverviewSnapshot(),
  ])
  const weakest = getLowestYoYComparisonRow(rows)
  const strongestVolume = getMostActiveComparisonRow(rows)
  const highestMedian = getHighestMedianComparisonRow(rows)

  return (
    <PprComparisonPageShell
      eyebrow="Falling markets"
      title="Falling property prices in tracked markets"
      intro="This view compares selected markets using recorded sales from the last 12 months. It highlights areas with the lowest year-on-year house-price growth, focusing on places with enough activity to ensure meaningful comparisons."
      highlights={[
        weakest
          ? {
              label: "Weakest mover",
              value: weakest.label,
              detail: `${signedPercent(weakest.yoyChangePct)} year on year with a ${numberDisplay(weakest.salesVolume)}-sale base.`,
            }
          : null,
        strongestVolume
          ? {
              label: "Largest sample",
              value: strongestVolume.label,
              detail: `${numberDisplay(strongestVolume.salesVolume)} recorded sales in the last 12 months.`,
            }
          : null,
        highestMedian
          ? {
              label: "Highest median in the set",
              value: highestMedian.label,
              detail: `${euroDisplay(highestMedian.medianPrice)} median despite recent weakness.`,
            }
          : null,
      ].filter(definedHighlight)}
      rows={rows}
      nationalMedian={nationalSnapshot.medianPrice}
      nationalYoYChangePct={nationalSnapshot.yoyChangePct}
      defaultSort="yoyChangePct"
      defaultDirection="asc"
      showRank
      showCounty
    />
  )
}
