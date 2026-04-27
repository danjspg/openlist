import type { Metadata } from "next"
import PprComparisonPageShell from "@/components/ppr/PprComparisonPageShell"
import {
  euroDisplay,
  getHighestYoYComparisonRow,
  getLowestMedianComparisonRow,
  getMostActiveComparisonRow,
  getNationalOverviewSnapshot,
  getRisingMarketRows,
  numberDisplay,
  signedPercent,
} from "@/lib/ppr-analytics"

function definedHighlight<T>(value: T | null): value is T {
  return Boolean(value)
}

export const revalidate = 21600

export const metadata: Metadata = {
  title: "Rising Property Prices Ireland | OpenList",
  description:
    "See the tracked Irish property markets with the strongest year-on-year house-price growth, filtered to avoid thin-sample noise.",
  alternates: {
    canonical: "/sold-prices/rising-markets",
  },
}

export default async function RisingMarketsPage() {
  const [rows, nationalSnapshot] = await Promise.all([
    getRisingMarketRows(),
    getNationalOverviewSnapshot(),
  ])
  const leader = getHighestYoYComparisonRow(rows)
  const strongestVolume = getMostActiveComparisonRow(rows)
  const lowestMedian = getLowestMedianComparisonRow(rows)

  return (
    <PprComparisonPageShell
      eyebrow="Rising markets"
      title="Rising property prices in tracked markets"
      intro="This view compares selected markets using recorded sales from the last 12 months. It highlights areas with the strongest year-on-year house-price growth, while focusing on places with enough activity to ensure meaningful comparisons."
      highlights={[
        leader
          ? {
              label: "Top mover",
              value: leader.label,
              valueHref: leader.href,
              detail: `${signedPercent(leader.yoyChangePct)} year on year with a ${numberDisplay(leader.salesVolume)}-sale base.`,
            }
          : null,
        strongestVolume
          ? {
              label: "Largest sample",
              value: strongestVolume.label,
              valueHref: strongestVolume.href,
              detail: `${numberDisplay(strongestVolume.salesVolume)} recorded sales in the last 12 months.`,
            }
          : null,
        lowestMedian
          ? {
              label: "Lowest median in the set",
              value: lowestMedian.label,
              valueHref: lowestMedian.href,
              detail: `${euroDisplay(lowestMedian.medianPrice)} median despite strong recent growth.`,
            }
          : null,
      ].filter(definedHighlight)}
      rows={rows}
      nationalMedian={nationalSnapshot.medianPrice}
      nationalYoYChangePct={nationalSnapshot.yoyChangePct}
      defaultSort="yoyChangePct"
      showRank
      showCounty
    />
  )
}
