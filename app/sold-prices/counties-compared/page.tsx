import type { Metadata } from "next"
import PprComparisonPageShell from "@/components/ppr/PprComparisonPageShell"
import {
  euroDisplay,
  getClosestToNationalMedianComparisonRow,
  getCountiesComparedRows,
  getHighestMedianComparisonRow,
  getHighestYoYComparisonRow,
  getLowestMedianComparisonRow,
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
  title: "Ireland County House Prices | Counties Compared",
  description:
    "Compare house prices across Ireland's 26 counties, including median sale prices, sales activity and year-on-year market trends.",
  alternates: {
    canonical: "/sold-prices/counties-compared",
  },
}

export default async function CountiesComparedPage() {
  const [rows, nationalSnapshot] = await Promise.all([
    getCountiesComparedRows(),
    getNationalOverviewSnapshot(),
  ])
  const highestMedian = getHighestMedianComparisonRow(rows)
  const lowestMedian = getLowestMedianComparisonRow(rows)
  const mostActive = getMostActiveComparisonRow(rows)
  const strongestGrowth = getHighestYoYComparisonRow(rows)
  const weakestGrowth = getLowestYoYComparisonRow(rows)
  const closestToNational = getClosestToNationalMedianComparisonRow(rows)

  return (
    <PprComparisonPageShell
      eyebrow="Counties compared"
      title="County house prices compared"
      intro="This view compares Ireland's counties using recorded sales from the last 12 months. It helps you compare house prices, sales activity and recent market trends across the county market pages."
      highlights={[
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
        mostActive
          ? {
              label: "Most active",
              value: mostActive.label,
              valueHref: mostActive.href,
              detail: `${numberDisplay(mostActive.salesVolume)} recorded sales in the last 12 months.`,
            }
          : null,
        strongestGrowth
          ? {
              label: "Strongest growth",
              value: strongestGrowth.label,
              valueHref: strongestGrowth.href,
              detail: `${signedPercent(strongestGrowth.yoyChangePct)} price change year on year.`,
            }
          : null,
        weakestGrowth
          ? {
              label: "Weakest growth",
              value: weakestGrowth.label,
              valueHref: weakestGrowth.href,
              detail: `${signedPercent(weakestGrowth.yoyChangePct)} price change year on year.`,
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
      defaultSort="medianPrice"
      showRank
      extraColumn={{
        key: "activityChangePct",
        label: "Activity YoY",
        mobileLabel: "Activity YoY",
        format: "pct",
      }}
    />
  )
}
