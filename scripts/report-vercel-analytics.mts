import { createClient } from "@supabase/supabase-js"
import { getPlanningAuthorityBySlug } from "../lib/planning-authorities"
import { planningReferenceFromSlug } from "../lib/property-intelligence"
import {
  countVercelVisits,
  readVercelAnalyticsConfig,
  topVercelDimension,
  topVercelEvents,
  topVercelPaths,
  VercelAnalyticsDimensionRow,
  VercelAnalyticsPathRow,
} from "../lib/vercel-web-analytics"

const subtractDays = (date: Date, days: number) =>
  new Date(date.getTime() - days * 24 * 60 * 60 * 1000)

const formatCount = (value: number) => value.toLocaleString("en-GB")

type NotableMetadata = {
  displayName: string | null
  categories: string[]
  sources: string[]
}

type DimensionCount = { visitors: number; pageviews: number; pages: number }

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

const printDimensionRows = (
  label: string,
  rows: VercelAnalyticsDimensionRow[],
  limit = 10
) => {
  console.log(label)
  if (rows.length === 0) {
    console.log("- no observed rows")
    return
  }
  for (const row of rows.slice(0, limit)) {
    console.log(`- ${row.value}: ${formatCount(row.visitors)} visitors, ${formatCount(row.pageviews)} pageviews`)
  }
}

export function parsePlanningApplicationPath(requestPath: string) {
  const match = requestPath.match(/^\/planning\/([^/]+)\/(ref-[^/?#]+)$/)
  if (!match) return null
  const authority = getPlanningAuthorityBySlug(match[1])
  const reference = planningReferenceFromSlug(match[2])
  if (!authority || !reference) return null
  return { authorityCode: authority.code, reference }
}

export function aggregateNotableDimensions(
  rows: VercelAnalyticsPathRow[],
  metadata: Map<string, NotableMetadata>
) {
  const categories = new Map<string, DimensionCount>()
  const sources = new Map<string, DimensionCount>()
  const add = (map: Map<string, DimensionCount>, key: string, row: VercelAnalyticsPathRow) => {
    const current = map.get(key) || { visitors: 0, pageviews: 0, pages: 0 }
    current.visitors += row.visitors
    current.pageviews += row.pageviews
    current.pages += 1
    map.set(key, current)
  }
  for (const row of rows) {
    const item = metadata.get(row.requestPath)
    if (!item) continue
    for (const category of item.categories) add(categories, category, row)
    for (const source of item.sources) add(sources, source, row)
  }
  return { categories, sources }
}

async function loadNotableMetadata(paths: string[]) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  if (!url || !key) return null

  const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
  const identities = paths.flatMap((requestPath) => {
    const parsed = parsePlanningApplicationPath(requestPath)
    return parsed ? [{ requestPath, ...parsed }] : []
  })
  if (!identities.length) return new Map<string, NotableMetadata>()

  const applicationByKey = new Map<string, { id: string; local_authority_code: string; reference: string }>()
  const authorityCodes = [...new Set(identities.map((item) => item.authorityCode))]
  for (const authorityCode of authorityCodes) {
    const references = identities
      .filter((item) => item.authorityCode === authorityCode)
      .map((item) => item.reference)
    for (let offset = 0; offset < references.length; offset += 100) {
      const { data, error } = await supabase
        .from("planning_applications")
        .select("id,local_authority_code,reference")
        .eq("local_authority_code", authorityCode)
        .in("reference", references.slice(offset, offset + 100))
      if (error) throw error
      for (const row of data || []) {
        applicationByKey.set(`${row.local_authority_code}\u0000${row.reference}`, row)
      }
    }
  }

  const applicationIds = [...new Set([...applicationByKey.values()].map((row) => row.id))]
  const notableById = new Map<string, NotableMetadata>()
  for (let offset = 0; offset < applicationIds.length; offset += 200) {
    const { data, error } = await supabase
      .from("planning_seo_notable")
      .select("application_id,display_name,notable_categories,classification_sources")
      .eq("active", true)
      .eq("priority_eligible", true)
      .in("application_id", applicationIds.slice(offset, offset + 200))
    if (error) throw error
    for (const row of data || []) {
      notableById.set(row.application_id, {
        displayName: row.display_name || null,
        categories: Array.isArray(row.notable_categories) ? row.notable_categories : [],
        sources: Array.isArray(row.classification_sources) ? row.classification_sources : [],
      })
    }
  }

  const result = new Map<string, NotableMetadata>()
  for (const identity of identities) {
    const application = applicationByKey.get(`${identity.authorityCode}\u0000${identity.reference}`)
    if (!application) continue
    const notable = notableById.get(application.id)
    if (notable) result.set(identity.requestPath, notable)
  }
  return result
}

function printNotableWindow(
  label: string,
  rows: VercelAnalyticsPathRow[],
  metadata: Map<string, NotableMetadata>
) {
  const applicationRows = rows.filter((row) => row.requestPath !== "Others" && parsePlanningApplicationPath(row.requestPath))
  const notableRows = applicationRows
    .filter((row) => metadata.has(row.requestPath))
    .sort((a, b) => b.visitors - a.visitors || b.pageviews - a.pageviews)
  console.log(`Top notable Planning application pages by visitors, ${label}:`)
  if (!notableRows.length) console.log("- no notable applications in Vercel's top Planning paths")
  for (const row of notableRows.slice(0, 10)) {
    const item = metadata.get(row.requestPath)!
    const name = item.displayName ? ` — ${item.displayName}` : ""
    const categories = item.categories.length ? ` [${item.categories.join(", ")}]` : ""
    console.log(`- ${row.requestPath}${name}${categories}: ${formatCount(row.visitors)} visitors, ${formatCount(row.pageviews)} pageviews`)
  }

  const observedVisitors = applicationRows.reduce((sum, row) => sum + row.visitors, 0)
  const notableVisitors = notableRows.reduce((sum, row) => sum + row.visitors, 0)
  const observedPageviews = applicationRows.reduce((sum, row) => sum + row.pageviews, 0)
  const notablePageviews = notableRows.reduce((sum, row) => sum + row.pageviews, 0)
  console.log(
    `- Observed notable share within Vercel's top 100 Planning paths: ${formatCount(notableVisitors)}/${formatCount(observedVisitors)} visitors; ${formatCount(notablePageviews)}/${formatCount(observedPageviews)} pageviews`
  )

  const dimensions = aggregateNotableDimensions(notableRows, metadata)
  const printDimension = (name: string, values: Map<string, DimensionCount>) => {
    const sorted = [...values.entries()].sort((a, b) => b[1].visitors - a[1].visitors || b[1].pageviews - a[1].pageviews)
    if (!sorted.length) return
    console.log(`${name}, ${label} (overlapping dimensions; top-100-path sample):`)
    for (const [key, count] of sorted.slice(0, 10)) {
      console.log(`- ${key}: ${formatCount(count.visitors)} visitors, ${formatCount(count.pageviews)} pageviews across ${formatCount(count.pages)} pages`)
    }
  }
  printDimension("Notable traffic by category", dimensions.categories)
  printDimension("Notable traffic by classification source", dimensions.sources)
}

async function safeDimension(
  label: string,
  query: () => Promise<VercelAnalyticsDimensionRow[]>
): Promise<VercelAnalyticsDimensionRow[]> {
  try {
    return await query()
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.log(`${label}: unavailable — ${message}`)
    return []
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
    const [last24h, last7d, last28d, planning28d, soldPrices28d, planningPaths24h, planningPaths7d, planningPaths28d, soldPaths] =
      await Promise.all([
        countVercelVisits(config, since24h, until),
        countVercelVisits(config, since7d, until),
        countVercelVisits(config, since28d, until),
        countVercelVisits(config, since28d, until, planningFilter),
        countVercelVisits(config, since28d, until, soldPricesFilter),
        topVercelPaths(config, since24h, until, 100, planningFilter),
        topVercelPaths(config, since7d, until, 100, planningFilter),
        topVercelPaths(config, since28d, until, 100, planningFilter),
        topVercelPaths(config, since28d, until, 100, soldPricesFilter),
      ])

    const topPlanningApplications = planningPaths28d
      .filter((row) => row.requestPath !== "Others" && row.requestPath.includes("/ref-"))
      .sort((a, b) => b.visitors - a.visitors || b.pageviews - a.pageviews)
      .slice(0, 10)
    const topSoldPrices = soldPaths
      .filter((row) => row.requestPath !== "Others" && row.requestPath !== "/sold-prices")
      .sort((a, b) => b.visitors - a.visitors || b.pageviews - a.pageviews)
      .slice(0, 10)

    console.log("Vercel Web Analytics (production traffic, rolling windows):")
    console.log(`- Captured: ${until.toISOString()}`)
    console.log(`- Last 24 hours: ${formatCount(last24h.visitors)} visitors, ${formatCount(last24h.pageviews)} pageviews`)
    console.log(`- Last 7 days: ${formatCount(last7d.visitors)} visitors, ${formatCount(last7d.pageviews)} pageviews`)
    console.log(`- Last 28 days: ${formatCount(last28d.visitors)} visitors, ${formatCount(last28d.pageviews)} pageviews`)
    console.log(`- Planning, last 28 days: ${formatCount(planning28d.visitors)} visitors, ${formatCount(planning28d.pageviews)} pageviews`)
    console.log(`- Sold Prices, last 28 days: ${formatCount(soldPrices28d.visitors)} visitors, ${formatCount(soldPrices28d.pageviews)} pageviews`)
    printPathRows("Top Planning application pages by visitors, last 28 days:", topPlanningApplications)
    printPathRows("Top Sold Prices pages by visitors, last 28 days:", topSoldPrices)

    console.log("Traffic acquisition and audience, last 28 days:")
    const [referrers, countries, devices, operatingSystems, browsers, routes, utmSources, utmCampaigns] = await Promise.all([
      safeDimension("Top referrers", () => topVercelDimension(config, since28d, until, "referrerHostname", 10)),
      safeDimension("Top countries", () => topVercelDimension(config, since28d, until, "country", 10)),
      safeDimension("Device mix", () => topVercelDimension(config, since28d, until, "deviceType", 10)),
      safeDimension("Operating systems", () => topVercelDimension(config, since28d, until, "osName", 10)),
      safeDimension("Browsers", () => topVercelDimension(config, since28d, until, "browserName", 10)),
      safeDimension("Routes", () => topVercelDimension(config, since28d, until, "route", 10)),
      safeDimension("UTM sources", () => topVercelDimension(config, since28d, until, "utmSource", 10)),
      safeDimension("UTM campaigns", () => topVercelDimension(config, since28d, until, "utmCampaign", 10)),
    ])
    printDimensionRows("Top referrer hostnames:", referrers)
    printDimensionRows("Top countries:", countries)
    printDimensionRows("Device mix:", devices)
    printDimensionRows("Top operating systems:", operatingSystems)
    printDimensionRows("Top browsers:", browsers)
    printDimensionRows("Top framework routes:", routes)
    if (utmSources.length) printDimensionRows("UTM sources:", utmSources)
    if (utmCampaigns.length) printDimensionRows("UTM campaigns:", utmCampaigns)

    try {
      const customEvents = await topVercelEvents(config, since28d, until, 20)
      console.log("Custom conversion/interactions, last 28 days:")
      if (!customEvents.length) {
        console.log("- no custom events observed yet; page traffic analytics remain active")
      } else {
        for (const event of customEvents) {
          console.log(`- ${event.eventName}: ${formatCount(event.count)} events, ${formatCount(event.visitors)} visitors`)
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      console.log(`Custom conversion/interactions: unavailable — ${message}`)
    }

    const notableMetadata = await loadNotableMetadata([
      ...new Set([...planningPaths24h, ...planningPaths7d, ...planningPaths28d].map((row) => row.requestPath)),
    ])
    if (!notableMetadata) {
      console.log("Notable Planning traffic: unavailable (Supabase credentials not configured)")
    } else {
      printNotableWindow("last 24 hours", planningPaths24h, notableMetadata)
      printNotableWindow("last 7 days", planningPaths7d, notableMetadata)
      printNotableWindow("last 28 days", planningPaths28d, notableMetadata)
      console.log("Notable/category totals are an observed top-100 Planning-path sample because Vercel's aggregate endpoint caps requestPath results at 100; individual top notable rankings within that observed set are exact.")
    }

    console.log("Vercel Web Analytics measures actual production visits from all traffic sources; Search Console remains the source for Google search performance. Referrer, geography, device, route and custom-event sections use Vercel's public aggregate API and degrade independently if a dimension is unavailable.")
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.log(`Vercel Web Analytics: unavailable — ${message}`)
  }
}

if (process.argv[1]?.endsWith("report-vercel-analytics.mts")) await main()
