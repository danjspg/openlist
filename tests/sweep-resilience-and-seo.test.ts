import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import path from "node:path"
import test from "node:test"

const repoRoot = process.cwd()
const source = (relativePath: string) => readFile(path.join(repoRoot, relativePath), "utf8")

test("server-side Supabase reads fail fast during database outages", async () => {
  const supabase = await source("lib/supabase.ts")
  assert.match(supabase, /SUPABASE_UPSTREAM_TIMEOUT/)
  assert.match(supabase, /AbortSignal\.timeout|setTimeout/)
})

test("the root sitemap does not query Supabase during production builds", async () => {
  const sitemap = await source("app/sitemap.ts")
  assert.doesNotMatch(sitemap, /getServerSupabase|getOptionalServerSupabase|createClient/)
  assert.match(sitemap, /sitemap-snapshots/)
})

test("Planning locality web reads use snapshots instead of scanning applications", async () => {
  const [localitySeo, localityPage] = await Promise.all([
    source("lib/locality-seo.ts"),
    source("app/planning/[authority]/areas/[areaSlug]/page.tsx"),
  ])

  assert.match(localitySeo, /openlist_planning_locality_directory/)
  assert.match(localityPage, /openlist_planning_locality_page_model/)
  assert.doesNotMatch(localityPage, /\.from\("planning_applications"\)/)
  assert.match(localitySeo, /const POSTGREST_PAGE_SIZE = 1000/)
  assert.match(localitySeo, /openlist_planning_locality_directory[\s\S]*?\.range\(from,/)
  assert.match(localitySeo, /openlist_planning_locality_sitemap[\s\S]*?\.range\(from,/)
})

test("Planning detail supporting context fails soft without a duplicate layout lookup", async () => {
  const [planning, research, layout] = await Promise.all([
    source("lib/planning.ts"),
    source("lib/property-research.ts"),
    source("app/planning/[authority]/[reference]/layout.tsx"),
  ])

  assert.match(planning, /Planning timeline unavailable[\s\S]*?return \[\] as PlanningEvent\[\]/)
  assert.match(research, /Planning research context unavailable[\s\S]*?matchPlanningLocation\(application, \[\]\)/)
  assert.match(research, /nearbySales: \[\]/)
  assert.doesNotMatch(layout, /getPlanningApplication|Planning notable layout lookup unavailable/)
})

test("Planning category metadata and builds perform no Supabase read", async () => {
  const [categories, page] = await Promise.all([
    source("lib/planning-public-categories.ts"),
    source("app/planning/categories/[category]/page.tsx"),
  ])

  assert.match(page, /export const dynamic\s*=\s*"force-dynamic"/)
  assert.match(page, /generateMetadata[\s\S]*?PLANNING_PUBLIC_CATEGORIES\.find/)
  assert.doesNotMatch(page.match(/generateMetadata[\s\S]*?\n\}/)?.[0] || "", /getPlanningPublicCategory|Supabase/)
  assert.match(categories, /openlist_planning_public_category_index/)
  assert.match(categories, /v6-shared-compact-index/)
})

test("Planning categories are explicitly discoverable in the root sitemap", async () => {
  const [sitemap, generator] = await Promise.all([
    source("app/sitemap.ts"),
    source("scripts/generate-sitemap-snapshots.mts"),
  ])

  assert.match(sitemap, /"\/planning\/categories"/)
  assert.match(sitemap, /snapshots\.sitemaps\.root/)
  assert.match(generator, /planningPublicCategorySummariesFromCounts\(categoryCounts, 3\)/)
  assert.match(generator, /`\/planning\/categories\/\$\{category\.slug\}`/)
})

test("exact Planning revalidation uses only the dedicated queue and retries transient acknowledgement failures", async () => {
  const [revalidation, retirement] = await Promise.all([
    source("lib/planning-revalidation.ts"),
    source("lib/planning-revalidation-retirement.ts"),
  ])

  assert.match(revalidation, /planning_revalidation_queue/)
  assert.doesNotMatch(revalidation, /revalidatePath\(/)
  assert.match(retirement, /attempts/)
  assert.match(retirement, /last_error/)
})

test("Planning status browse avoids exact counts and has an order-compatible index", async () => {
  const [planning, migration] = await Promise.all([
    source("lib/planning.ts"),
    source("supabase/migrations/20260829185000_add_planning_status_browse_index.sql"),
  ])

  assert.doesNotMatch(planning, /count:\s*"exact"/)
  assert.match(migration, /normalized_status, registration_date desc nulls last, reference desc/)
})

test("database migrations preserve deterministic repairs", async () => {
  const migration = await source("supabase/migrations/20260827193000_add_planning_integrity_repairs.sql")
  assert.match(migration, /openlist_repair_planning_integrity/)
})
