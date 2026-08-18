import { createClient } from "@supabase/supabase-js"

import { getPlanningAuthorityByCode } from "../lib/planning-authorities"
import { planningApplicationPath } from "../lib/property-intelligence"

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
