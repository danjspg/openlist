import { createClient } from "@supabase/supabase-js"

import {
  createGoogleSearchConsoleClient,
  readGoogleSearchConsoleConfig,
} from "../lib/google-search-console"
import {
  buildPlanningSitemapEntries,
  normaliseInspectionResponse,
  parsePlanningDetailUrl,
  PlanningInspectionCandidate,
  SearchConsoleInspectionResponse,
  PlanningSitemapApplication,
  selectInspectionSample,
} from "../lib/planning-seo"

const args = new Set(process.argv.slice(2))
const dryRun = args.has("--dry-run")
const skipInspections = args.has("--skip-inspections")
const skipPerformance = args.has("--skip-performance")
const skipSitemaps = args.has("--skip-sitemaps")
const promoteNotable = args.has("--promote-notable")
const siteBaseUrl = (process.env.NEXT_PUBLIC_SITE_URL || "https://www.openlist.ie").replace(
  /\/+$/,
  ""
)
const inspectionLimit = Math.min(
  1000,
  Math.max(0, Number(process.env.PLANNING_SEO_INSPECTION_LIMIT || 200))
)

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!supabaseUrl || !serviceRoleKey) {
  throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY")
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
})
const searchConsole = createGoogleSearchConsoleClient(
  readGoogleSearchConsoleConfig()
)

function option(name: string) {
  const index = process.argv.indexOf(name)
  return index >= 0 ? process.argv[index + 1] : undefined
}

function isoDate(date: Date) {
  return date.toISOString().slice(0, 10)
}

function dateRange() {
  const explicit = option("--date")
  const defaultDate = new Date()
  defaultDate.setUTCDate(defaultDate.getUTCDate() - 3)
  const from = option("--from") || explicit || isoDate(defaultDate)
  const to = option("--to") || explicit || from
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
    throw new Error("Dates must use YYYY-MM-DD")
  }

  const dates: string[] = []
  const cursor = new Date(`${from}T00:00:00Z`)
  const end = new Date(`${to}T00:00:00Z`)
  if (cursor > end) throw new Error("--from must be on or before --to")
  while (cursor <= end) {
    dates.push(isoDate(cursor))
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  }
  return dates
}

async function rpc<T>(name: string, parameters: Record<string, unknown> = {}) {
  const { data, error } = await supabase.rpc(name, parameters)
  if (error) throw new Error(`${name}: ${error.message}`)
  return data as T
}

async function loadSitemapCohorts() {
  async function loadCohort(functionName: string) {
    const rows: PlanningSitemapApplication[] = []
    for (let offset = 0; offset < 5000; offset += 1000) {
      const page = await rpc<PlanningSitemapApplication[]>(functionName, {
        p_limit: 1000,
        p_offset: offset,
      })
      rows.push(...page)
      if (page.length < 1000) break
    }
    return rows
  }
  const [recent, notable] = await Promise.all([
    loadCohort("openlist_planning_recent_sitemap"),
    loadCohort("openlist_planning_notable_sitemap"),
  ])

  if (!dryRun) {
    await rpc("openlist_sync_planning_sitemap_memberships", {
      p_recent_ids: recent.map((row) => row.id),
      p_notable_ids: notable.map((row) => row.id),
    })
  }
  console.log(`Sitemap cohorts: ${recent.length} recent, ${notable.length} notable`)
  return { recent, notable }
}

async function collectSitemaps() {
  if (skipSitemaps) return
  const sitemaps = await searchConsole.listSitemaps()
  const observedOn = isoDate(new Date())
  const rows = sitemaps
    .filter((sitemap) => sitemap.path?.includes("sitemap"))
    .map((sitemap) => ({
      sitemap_path: sitemap.path!,
      observed_on: observedOn,
      observed_at: new Date().toISOString(),
      submitted: sitemap.contents?.reduce(
        (total, content) => total + Number(content.submitted || 0),
        0
      ),
      last_submitted: sitemap.lastSubmitted || null,
      last_downloaded: sitemap.lastDownloaded || null,
      is_pending: sitemap.isPending ?? null,
      errors: Number(sitemap.errors || 0),
      warnings: Number(sitemap.warnings || 0),
      raw_result: sitemap,
    }))
  if (!dryRun && rows.length > 0) {
    const { error } = await supabase
      .from("planning_seo_sitemap_observations")
      .upsert(rows, { onConflict: "sitemap_path,observed_on" })
    if (error) throw error
  }
  console.log(`Search Console sitemap observations: ${rows.length}`)
}

async function collectPerformance() {
  if (skipPerformance) return
  for (const dataDate of dateRange()) {
    const rows = await searchConsole.queryPlanningPerformance(dataDate)
    const planningRows = rows.flatMap((row) => {
      const parsed = parsePlanningDetailUrl(row.keys?.[1] || "")
      if (!parsed) return []
      return [{
        data_date: row.keys?.[0] || dataDate,
        local_authority_code: parsed.localAuthorityCode,
        reference: parsed.reference,
        clicks: Number(row.clicks || 0),
        impressions: Number(row.impressions || 0),
        ctr: Number(row.ctr || 0),
        position: Number(row.position || 0),
      }]
    })
    let affected = 0
    if (!dryRun) {
      for (let index = 0; index < planningRows.length; index += 500) {
        affected += await rpc<number>("openlist_upsert_planning_search_performance", {
          p_rows: planningRows.slice(index, index + 500),
        })
      }
    }
    console.log(
      `Search performance ${dataDate}: ${rows.length} API rows, ${planningRows.length} planning detail rows, ${affected} stored`
    )
  }
}

async function collectInspections(cohorts: {
  recent: PlanningSitemapApplication[]
  notable: PlanningSitemapApplication[]
}) {
  if (skipInspections || inspectionLimit === 0) return
  const candidates = await rpc<PlanningInspectionCandidate[]>(
    "openlist_planning_seo_inspection_candidates",
    { p_limit: Math.min(5000, Math.max(1000, inspectionLimit * 5)) }
  )
  const selected = selectInspectionSample(candidates, inspectionLimit)
  const applications = new Map(
    [...cohorts.recent, ...cohorts.notable].map((application) => [
      application.id,
      application,
    ])
  )

  let stored = 0
  for (let index = 0; index < selected.length; index += 5) {
    const batch = selected.slice(index, index + 5)
    const results = await Promise.all(
      batch.map(async (candidate) => {
        const application = applications.get(candidate.application_id) || {
          id: candidate.application_id,
          local_authority_code: candidate.local_authority_code,
          reference: candidate.reference,
          registration_date: null,
          updated_at: null,
        }
        const entry = buildPlanningSitemapEntries([application], siteBaseUrl)[0]
        if (!entry) return null
        const rawResult =
          await searchConsole.inspectUrl<SearchConsoleInspectionResponse>(entry.url)
        const result = normaliseInspectionResponse(rawResult)
        return {
          application_id: candidate.application_id,
          inspected_on: isoDate(new Date()),
          inspected_at: new Date().toISOString(),
          verdict: result.verdict,
          coverage_state: result.coverageState,
          robots_txt_state: result.robotsTxtState,
          indexing_state: result.indexingState,
          page_fetch_state: result.pageFetchState,
          last_crawl_time: result.lastCrawlTime,
          crawled_as: result.crawledAs,
          google_canonical: result.googleCanonical,
          user_canonical: result.userCanonical,
          sitemaps: result.sitemaps,
          referring_urls: result.referringUrls,
          inspection_result_link: result.inspectionResultLink,
          is_indexed: result.isIndexed,
          is_discovered: result.isDiscovered,
          raw_result: rawResult,
        }
      })
    )
    const rows = results.filter((row) => row !== null)
    if (!dryRun && rows.length > 0) {
      const { error } = await supabase
        .from("planning_seo_inspections")
        .upsert(rows, { onConflict: "application_id,inspected_on" })
      if (error) throw error
    }
    stored += rows.length
    console.log(`URL inspections: ${Math.min(index + 5, selected.length)}/${selected.length}`)
  }
  console.log(`URL inspection results ${dryRun ? "selected" : "stored"}: ${stored}`)
}

const cohorts = await loadSitemapCohorts()
await collectSitemaps()
await collectPerformance()
await collectInspections(cohorts)
if (promoteNotable) {
  const promoted = dryRun
    ? 0
    : await rpc<number>("openlist_promote_planning_seo_notable")
  console.log(`Notable applications promoted: ${promoted}`)
}
console.log(`Planning SEO collection complete${dryRun ? " (dry run)" : ""}`)
