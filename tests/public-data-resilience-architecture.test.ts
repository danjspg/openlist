import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

async function source(path: string) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8")
}

const runtimeLinkSurfaces = [
  "components/planning/PlanningApplicationResult.tsx",
  "components/planning/PlanningLandingExplore.tsx",
  "components/planning/PlanningCategoryLinks.tsx",
  "components/ppr/PprSaleCard.tsx",
  "components/ppr/PprComparisonTable.tsx",
  "app/search/page.tsx",
  "app/planning/areas/page.tsx",
  "app/planning/[authority]/areas/page.tsx",
  "app/planning/[authority]/areas/[areaSlug]/page.tsx",
  "app/planning/categories/[category]/page.tsx",
  "app/sold-prices/page.tsx",
  "app/sold-prices/[county]/page.tsx",
  "app/sold-prices/[county]/[areaSlug]/page.tsx",
] as const

test("runtime-data links centrally disable speculative Next prefetch", async () => {
  const wrapper = await source("components/RuntimeDataLink.tsx")
  assert.match(wrapper, /<NextLink \{\.\.\.props\} prefetch=\{false\}/)

  for (const path of runtimeLinkSurfaces) {
    const contents = await source(path)
    assert.match(contents, /@\/components\/RuntimeDataLink/, path)
    assert.doesNotMatch(contents, /from "next\/link"/, path)
  }
})

test("static editorial links retain normal Next prefetch behavior", async () => {
  const [layout, nav] = await Promise.all([
    source("app/layout.tsx"),
    source("components/Nav.tsx"),
  ])
  assert.match(layout, /import Link from "next\/link"/)
  assert.match(layout, /<Link href="\/about"/)
  assert.match(nav, /item\.href === "\/about" \? NextLink : RuntimeDataLink/)
})

test("public route caching is explicit and private surfaces cannot become ISR", async () => {
  const isrRoutes = [
    "app/planning/[authority]/page.tsx",
    "app/planning/[authority]/areas/page.tsx",
    "app/planning/[authority]/areas/[areaSlug]/page.tsx",
    "app/planning/categories/page.tsx",
    "app/sold-prices/[county]/page.tsx",
    "app/sold-prices/[county]/[areaSlug]/page.tsx",
  ] as const

  for (const path of isrRoutes) {
    const contents = await source(path)
    assert.doesNotMatch(contents, /force-dynamic/, path)
    assert.match(contents, /revalidate/, path)
  }

  const dynamicDataCacheHubs = await Promise.all([
    source("app/page.tsx"),
    source("app/planning/page.tsx"),
    source("app/planning/areas/page.tsx"),
    source("app/sold-prices/page.tsx"),
  ])
  for (const contents of dynamicDataCacheHubs) {
    assert.match(contents, /force-dynamic/)
    assert.doesNotMatch(contents, /export const revalidate/)
  }

  const [planningSearch, soldSearch, categoryPage, privateAlerts] = await Promise.all([
    source("app/planning/applications/page.tsx"),
    source("app/sold-prices/search/page.tsx"),
    source("app/planning/categories/[category]/page.tsx"),
    source("app/my-alerts/page.tsx"),
  ])
  assert.match(planningSearch, /force-dynamic/)
  assert.match(soldSearch, /force-dynamic/)
  assert.match(categoryPage, /force-dynamic/)
  assert.match(privateAlerts, /requireUser/)
  assert.doesNotMatch(privateAlerts, /export const revalidate/)
})

test("filtered Planning performs only its bounded result query", async () => {
  const [planning, page, middleware] = await Promise.all([
    source("lib/planning.ts"),
    source("app/planning/page.tsx"),
    source("middleware.ts"),
  ])
  assert.match(planning, /hasApplicationFilters\s*\? Promise\.resolve\(null\)\s*:\s*getPlanningAggregateSummaryCached/)
  assert.match(planning, /\.eq\("normalized_status", normalisePlanningStatus\(filters\.status\)\)/)
  assert.match(planning, /\.limit\(25\)/)
  assert.doesNotMatch(page, /searchParams|getPlanningLocalityDirectory/)
  assert.match(middleware, /key: "construction"/)
})

test("snapshot failure cannot start heavier Planning or PPR reconstruction", async () => {
  const [planning, pprAnalytics, soldHub, homepage, localityMigration] = await Promise.all([
    source("lib/planning.ts"),
    source("lib/ppr-analytics.ts"),
    source("app/sold-prices/page.tsx"),
    source("app/page.tsx"),
    source("supabase/migrations/20260901100000_add_compact_planning_locality_page_model.sql"),
  ])

  assert.match(planning, /openlist_planning_dashboard_snapshot/)
  assert.doesNotMatch(planning, /openlist_planning_dashboard_aggregate/)
  assert.match(planning, /openlist_planning_locality_page_model/)
  const localityLoader = planning.slice(
    planning.indexOf("export async function getPlanningLocalityDashboard"),
    planning.indexOf("function emptyPlanningAggregateSummary")
  )
  assert.doesNotMatch(localityLoader, /getPlanningDashboard|openlist_planning_area_aggregate|\.ilike\(/)
  assert.match(localityLoader, /degraded: true/)

  assert.doesNotMatch(pprAnalytics, /\|\|\s*get[A-Za-z]+Uncached|\?\?\s*get[A-Za-z]+Uncached/)
  assert.match(pprAnalytics, /missing derived row must not make a visitor request page through/)
  assert.match(pprAnalytics, /getNationalHomepageSnapshot/)
  assert.doesNotMatch(soldHub, /getNationalActivitySnapshot|getNationalOverviewSnapshot/)
  assert.match(homepage, /const notableItems=await getHomepageNotablePlanning/)
  assert.match(localityMigration, /limit 8/i)
  assert.match(localityMigration, /limit 5/i)
  assert.match(localityMigration, /limit 60/i)
  assert.doesNotMatch(localityMigration, /openlist_refresh_/i)
})

test("directory and locality failure paths degrade without reconstruction fan-out", async () => {
  const [directory, authority, areas, localityPage, canonicalPlace] = await Promise.all([
    source("lib/locality-seo.ts"),
    source("app/planning/[authority]/page.tsx"),
    source("app/planning/areas/page.tsx"),
    source("app/planning/[authority]/areas/[areaSlug]/page.tsx"),
    source("app/planning/areas/[placeSlug]/page.tsx"),
  ])
  assert.match(directory, /throw new Error\("Planning locality directory snapshot unavailable"\)/)
  assert.match(authority, /getPlanningLocalityDirectory\(\)\.catch\(\(\) => \[\]\)/)
  assert.match(areas, /getPlanningLocalityDirectory\(\)\.catch\(\(\) => \[\]\)/)
  assert.doesNotMatch(localityPage, /getPlanningLocalityNotableGroups/)
  assert.match(localityPage, /groupPlanningLocalityNotables/)
  assert.doesNotMatch(canonicalPlace, /Promise\.all\([\s\S]*members\.map/)
  assert.match(canonicalPlace, /for \(const \{ membership, authority \} of members\)/)
})

test("filtered category variants are noindex without deindexing canonical category pages", async () => {
  const [category, crawlPolicy] = await Promise.all([
    source("app/planning/categories/[category]/page.tsx"),
    source("lib/crawl-policy.ts"),
  ])
  assert.match(category, /const filtered=Boolean\(query\.authority\|\|query\.activeOnly\)/)
  assert.match(category, /robots:\{index:!filtered,follow:true\}/)
  assert.match(crawlPolicy, /searchParams\.has\("authority"\)[\s\S]*searchParams\.has\("activeOnly"\)/)
})
