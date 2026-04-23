import type { Metadata } from "next"
import PprComparisonPageShell from "@/components/ppr/PprComparisonPageShell"
import {
  getClosestToNationalMedianComparisonRow,
  euroDisplay,
  getCommuterTownRows,
  getLowestMedianComparisonRow,
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
  title: "Commuter Town Sold Prices | OpenList",
  description:
    "Compare recorded sale prices across OpenList's tracked commuter towns, including median prices, yearly change and sales volume.",
}

export default async function CommuterTownsPage() {
  const [rows, nationalSnapshot] = await Promise.all([
    getCommuterTownRows(),
    getNationalOverviewSnapshot(),
  ])
  const cheapest = getLowestMedianComparisonRow(rows)
  const mostActive = getMostActiveComparisonRow(rows)
  const closestToNational = getClosestToNationalMedianComparisonRow(rows)

  return (
    <PprComparisonPageShell
      eyebrow="Commuter towns"
      title="Commuter town sold prices"
      intro="This view compares selected commuter towns using recorded sales from the last 12 months. It helps you compare pricing and activity across the Dublin commuter belt."
      highlights={[
        cheapest
          ? {
              label: "Lowest median",
              value: cheapest.label,
              detail: `${euroDisplay(cheapest.medianPrice)} median over the last 12 months.`,
            }
          : null,
        mostActive
          ? {
              label: "Most active town",
              value: mostActive.label,
              detail: `${numberDisplay(mostActive.salesVolume)} recorded sales in the last 12 months.`,
            }
          : null,
        closestToNational
          ? {
              label: "Closest to national median",
              value: closestToNational.label,
              detail: `${signedPercent(closestToNational.vsNationalMedianPct)} versus the national 12-month median.`,
            }
          : null,
      ].filter(definedHighlight)}
      rows={rows}
      nationalMedian={nationalSnapshot.medianPrice}
      nationalYoYChangePct={nationalSnapshot.yoyChangePct}
      defaultSort="medianPrice"
      extraColumn={{
        key: "distanceFromDublinKm",
        label: "Distance*",
        mobileLabel: "Distance*",
        format: "km",
      }}
      footnote="* Approximate distance to Dublin city centre, using O'Connell Bridge as the reference point."
    />
  )
}
