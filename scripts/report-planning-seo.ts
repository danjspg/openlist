import { createClient } from "@supabase/supabase-js"

import { getPlanningAuthorityByCode } from "../lib/planning-authorities"
import { planningApplicationPath } from "../lib/property-intelligence"

type PerformanceRow = {
  data_date: string
  clicks: number | string
  impressions: number | string
  position: number | string
}

type PerformanceSummary = {
  clicks: number
  impressions: number
  ctr: number | null
  position: number | null
  days: number
}

const dateOnly = (date: Date) => date.toISOString().slice(0, 10)

const addDays = (isoDate: string, delta: number) => {
  const date = new Date(`${isoDate}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() + delta)
  return dateOnly(date)
}

const summarizePerformance = (
  rows: PerformanceRow[],
  startDate: string,
  endDate: string
): PerformanceSummary => {
  let clicks = 0
  let impressions = 0
  let weightedPosition = 0
  const dates = new Set<string>()

  for (const row of rows) {
    if (row.data_date < startDate || row.data_date > endDate) continue
    const rowClicks = Number(row.clicks || 0)
    const rowImpressions = Number(row.impressions || 0)
    const rowPosition = Number(row.position || 0)
    clicks += rowClicks
    impressions += rowImpressions
    weightedPosition += rowPosition * rowImpressions
    dates.add(row.data_date)
  }

  return {
    clicks,
    impressions,
    ctr: impressions > 0 ? clicks / impressions : null,
    position: impressions > 0 ? weightedPosition / impressions : null,
    days: dates.size,
  }
}

const formatPercent = (value: number | null) =>
  value === null ? "n/a" : `${(value * 100).toFixed(2)}%`

const formatChange = (current: number | null, previous: number | null) => {
  if (current === null || previous === null || previous === 0) return "n/a"
  const change = ((current - previous) / previous) * 100
  return `${change >= 0 ? "+" : ""}${change.toFixed(1)}%`
}

const formatPositionChange = (current: number | null, previous: number | null) => {
  if (current === null || previous === null) return "n/a"
  const improvement = previous - current
  return `${improvement >= 0 ? "+" : ""}${improvement.toFixed(2)} positions`
}

async function main() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY")
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data, error } = await supabase.rpc("openlist_planning_seo_report")
  if (error) throw error

  const report = data as Record<string, unknown>
  const inspected = Number(report.sampledUrlsInspected || 0)
  const indexed = Number(report.indexed || 0)
  const left = Number(report.recentUrlsLeftObserved || 0)
  const leftBeforeIndexed = Number(report.recentUrlsLeftBeforeIndexedInspection || 0)
  const percentage = (value: number, denominator: number) =>
    denominator > 0 ? `${((value / denominator) * 100).toFixed(1)}%` : "n/a"

  console.log("Planning SEO measurement")
  console.log(`Captured: ${report.capturedAt}`)
  console.log(`Planning records: ${report.totalPlanningRecords}`)
  console.log(
    `Sitemaps: ${report.recentSitemapUrls} recent + ${report.notableSitemapUrls} notable`
  )
  console.log(
    `Latest inspection sample: ${inspected}; ${report.indexed} indexed (${percentage(
      indexed,
      inspected
    )}), ${report.crawled} crawled, ${report.discoveredNotIndexed} discovered/not indexed, ${report.unknownInspected} unknown`
  )
  console.log(`Membership URLs not yet inspected: ${report.notInspected}`)
  console.log(
    `Median observed days from first sitemap observation to first indexed inspection: ${
      report.medianObservedDaysToIndexedInspection ?? "n/a"
    }`
  )
  console.log(
    `Recent URLs observed leaving before an indexed inspection: ${leftBeforeIndexed}/${left} (${percentage(
      leftBeforeIndexed,
      left
    )})`
  )
  console.log(
    `Search performance collected: ${report.planningClicks} clicks, ${report.planningImpressions} impressions; ${report.notablePagesWithTraffic} notable pages with impressions`
  )

  const { data: latestPerformance, error: latestPerformanceError } = await supabase
    .from("planning_seo_search_performance")
    .select("data_date")
    .order("data_date", { ascending: false })
    .limit(1)
    .maybeSingle()
  if (latestPerformanceError) throw latestPerformanceError

  if (latestPerformance?.data_date) {
    const latestDate = String(latestPerformance.data_date)
    const historyStart = addDays(latestDate, -55)
    const history: PerformanceRow[] = []
    const pageSize = 1000

    for (let offset = 0; ; offset += pageSize) {
      const { data: rows, error: rowsError } = await supabase
        .from("planning_seo_search_performance")
        .select("data_date,clicks,impressions,position")
        .gte("data_date", historyStart)
        .lte("data_date", latestDate)
        .order("data_date", { ascending: true })
        .range(offset, offset + pageSize - 1)
      if (rowsError) throw rowsError
      history.push(...((rows || []) as PerformanceRow[]))
      if (!rows || rows.length < pageSize) break
    }

    const current7Start = addDays(latestDate, -6)
    const previous7End = addDays(current7Start, -1)
    const previous7Start = addDays(previous7End, -6)
    const current28Start = addDays(latestDate, -27)
    const previous28End = addDays(current28Start, -1)
    const previous28Start = addDays(previous28End, -27)

    const current7 = summarizePerformance(history, current7Start, latestDate)
    const previous7 = summarizePerformance(history, previous7Start, previous7End)
    const current28 = summarizePerformance(history, current28Start, latestDate)
    const previous28 = summarizePerformance(history, previous28Start, previous28End)

    console.log("Search performance trends:")
    console.log(`- Latest Search Console data date: ${latestDate}`)
    console.log(
      `- Last 7 days (${current7.days} collected days): ${current7.clicks} clicks, ${current7.impressions} impressions, CTR ${formatPercent(current7.ctr)}, avg position ${current7.position?.toFixed(2) ?? "n/a"}`
    )
    console.log(
      `- Previous 7 days (${previous7.days} collected days): ${previous7.clicks} clicks, ${previous7.impressions} impressions, CTR ${formatPercent(previous7.ctr)}, avg position ${previous7.position?.toFixed(2) ?? "n/a"}`
    )
    console.log(
      `- 7-day change: clicks ${formatChange(current7.clicks, previous7.clicks)}, impressions ${formatChange(current7.impressions, previous7.impressions)}, CTR ${formatChange(current7.ctr, previous7.ctr)}, avg position ${formatPositionChange(current7.position, previous7.position)}`
    )
    console.log(
      `- Last 28 days (${current28.days} collected days): ${current28.clicks} clicks, ${current28.impressions} impressions, CTR ${formatPercent(current28.ctr)}, avg position ${current28.position?.toFixed(2) ?? "n/a"}`
    )
    console.log(
      `- Previous 28 days (${previous28.days} collected days): ${previous28.clicks} clicks, ${previous28.impressions} impressions, CTR ${formatPercent(previous28.ctr)}, avg position ${previous28.position?.toFixed(2) ?? "n/a"}`
    )
    console.log(
      `- 28-day change: clicks ${formatChange(current28.clicks, previous28.clicks)}, impressions ${formatChange(current28.impressions, previous28.impressions)}, CTR ${formatChange(current28.ctr, previous28.ctr)}, avg position ${formatPositionChange(current28.position, previous28.position)}`
    )
  } else {
    console.log("Search performance trends: no stored Search Console performance rows yet")
  }

  const notablePages = Number(report.notableCohortPages || 0)
  const recentPages = Number(report.recentCohortPages || 0)
  const perPage = (value: unknown, pages: number) =>
    pages > 0 ? (Number(value || 0) / pages).toFixed(2) : "n/a"
  console.log(
    `Current-cohort traffic density: notable ${perPage(
      report.notableCohortImpressions,
      notablePages
    )} impressions/page and ${perPage(
      report.notableCohortClicks,
      notablePages
    )} clicks/page (${notablePages} pages); recent ${perPage(
      report.recentCohortImpressions,
      recentPages
    )} impressions/page and ${perPage(
      report.recentCohortClicks,
      recentPages
    )} clicks/page (${recentPages} pages)`
  )

  const sitemapObservations = (report.sitemapObservations || []) as Array<{
    sitemap_path: string
    submitted: number | null
    is_pending: boolean | null
    errors: number | null
    warnings: number | null
  }>
  for (const sitemap of sitemapObservations) {
    console.log(
      `Search Console sitemap ${sitemap.sitemap_path}: ${
        sitemap.submitted ?? "unknown"
      } submitted, ${sitemap.errors ?? 0} errors, ${sitemap.warnings ?? 0} warnings${
        sitemap.is_pending ? ", pending" : ""
      }`
    )
  }

  const topPages = (report.topPlanningPages || []) as Array<{
    local_authority_code: string
    reference: string
    clicks: number
    impressions: number
    is_notable: boolean
  }>
  if (topPages.length > 0) {
    console.log("Top planning pages:")
    for (const page of topPages) {
      const authority = getPlanningAuthorityByCode(page.local_authority_code)
      const path = authority
        ? planningApplicationPath(authority, page.reference)
        : `${page.local_authority_code}/${page.reference}`
      console.log(
        `- ${path}: ${page.clicks} clicks, ${page.impressions} impressions${
          page.is_notable ? " [notable]" : ""
        }`
      )
    }
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
