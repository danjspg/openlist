import {
  countVercelVisits,
  readVercelAnalyticsConfig,
  topVercelPaths,
  VercelAnalyticsPathRow,
} from "../lib/vercel-web-analytics"

const subtractDays = (date: Date, days: number) =>
  new Date(date.getTime() - days * 24 * 60 * 60 * 1000)

const formatCount = (value: number) => value.toLocaleString("en-GB")

const printPathRows = (label: string, rows: VercelAnalyticsPathRow[]) => {
  console.log(label)
  if (rows.length === 0) {
    console.log("- no Web Analytics rows")
    return
  }

  for (const row of rows) {
    console.log(
      `- ${row.requestPath}: ${formatCount(row.visitors)} visitors, ${formatCount(row.pageviews)} pageviews`
    )
  }
}

async function main() {
  const config = readVercelAnalyticsConfig()
  if (!config) {
    console.log("Vercel Web Analytics: unavailable (token/project/team not configured)")
    return
  }

  const until = new Date()
  const since24h = subtractDays(until, 1)
  const since7d = subtractDays(until, 7)
  const since28d = subtractDays(until, 28)
  const planningFilter = "startswith(requestPath, '/planning')"
  const soldPricesFilter = "startswith(requestPath, '/sold-prices')"

  try {
    const [last24h, last7d, last28d, planning28d, soldPrices28d, planningPaths, soldPaths] =
      await Promise.all([
        countVercelVisits(config, since24h, until),
        countVercelVisits(config, since7d, until),
        countVercelVisits(config, since28d, until),
        countVercelVisits(config, since28d, until, planningFilter),
        countVercelVisits(config, since28d, until, soldPricesFilter),
        topVercelPaths(config, since28d, until, 100, planningFilter),
        topVercelPaths(config, since28d, until, 100, soldPricesFilter),
      ])

    const topPlanningApplications = planningPaths
      .filter((row) => row.requestPath.includes("/ref-"))
      .sort((a, b) => b.visitors - a.visitors || b.pageviews - a.pageviews)
      .slice(0, 10)
    const topSoldPrices = soldPaths
      .filter((row) => row.requestPath !== "/sold-prices")
      .sort((a, b) => b.visitors - a.visitors || b.pageviews - a.pageviews)
      .slice(0, 10)

    console.log("Vercel Web Analytics (production traffic, rolling windows):")
    console.log(
      `- Last 24 hours: ${formatCount(last24h.visitors)} visitors, ${formatCount(last24h.pageviews)} pageviews`
    )
    console.log(
      `- Last 7 days: ${formatCount(last7d.visitors)} visitors, ${formatCount(last7d.pageviews)} pageviews`
    )
    console.log(
      `- Last 28 days: ${formatCount(last28d.visitors)} visitors, ${formatCount(last28d.pageviews)} pageviews`
    )
    console.log(
      `- Planning, last 28 days: ${formatCount(planning28d.visitors)} visitors, ${formatCount(planning28d.pageviews)} pageviews`
    )
    console.log(
      `- Sold Prices, last 28 days: ${formatCount(soldPrices28d.visitors)} visitors, ${formatCount(soldPrices28d.pageviews)} pageviews`
    )
    printPathRows("Top Planning application pages by visitors, last 28 days:", topPlanningApplications)
    printPathRows("Top Sold Prices pages by visitors, last 28 days:", topSoldPrices)
    console.log(
      "Vercel Web Analytics measures actual production visits from all traffic sources; Search Console remains the source for Google search performance."
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.log(`Vercel Web Analytics: unavailable — ${message}`)
  }
}

await main()
