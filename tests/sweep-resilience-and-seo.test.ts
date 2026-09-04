import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

async function source(path: string) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8")
}

test("server-side Supabase reads fail fast during database outages", async () => {
  const supabase = await source("lib/supabase.ts")

  assert.doesNotMatch(supabase, /resilientServerFetch/)
  assert.doesNotMatch(supabase, /RETRYABLE_READ_STATUSES/)
  assert.doesNotMatch(supabase, /setTimeout/)
})

test("the root sitemap does not query Supabase during production builds", async () => {
  const sitemap = await source("app/sitemap.ts")

  assert.match(sitemap, /export const dynamic = "force-dynamic"/)
})

test("Planning locality web reads use snapshots instead of scanning applications", async () => {
  const [migration, localitySeo] = await Promise.all([
    source("supabase/migrations/20260830231451_snapshot_planning_locality_activity.sql"),
    source("lib/locality-seo.ts"),
  ])

  assert.match(migration, /openlist_refresh_planning_locality_activity_counts/)
  assert.match(migration, /openlist_planning_locality_directory[\s\S]*?m\.active_count/)
  assert.match(migration, /openlist_planning_locality_sitemap[\s\S]*?m\.evidence->>'latestRegistrationDate'/)
  assert.doesNotMatch(
    migration.match(/create or replace function public\.openlist_planning_locality_sitemap[\s\S]*?\$\$;/)?.[0] || "",
    /from public\.planning_applications/
  )
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
    source("supabase/migrations/20260901082000_retire_superseded_planning_paths.sql"),
  ])

  assert.match(revalidation, /error\.code === "57014"/)
  assert.match(revalidation, /retryTransientMutation/)
  assert.match(revalidation, /\.delete\(\)[\s\S]*?requested_at/)
  assert.doesNotMatch(revalidation, /revalidation_pending/)
  assert.match(retirement, /drop column revalidation_pending/)
  assert.match(retirement, /where revalidation_pending = true/)
})

test("Planning status browse avoids exact counts and has an order-compatible index", async () => {
  const [pagedSearch, migration] = await Promise.all([
    source("lib/planning-search-page.ts"),
    source("supabase/migrations/20260901074800_optimize_planning_status_browse_order.sql"),
  ])

  assert.doesNotMatch(pagedSearch, /count:\s*"exact"/)
  assert.match(pagedSearch, /\.range\(offset, offset \+ limit\)/)
  assert.match(migration, /normalized_status,[\s\S]*registration_date desc nulls last,[\s\S]*reference desc/)
  assert.match(migration, /drop index if exists public\.planning_applications_normalized_status_idx/)
})

test("database migrations preserve deterministic repairs", async () => {
  const [dublin, appeals] = await Promise.all([
    source("supabase/migrations/20260828203057_optimize_ppr_dublin_district_refresh.sql"),
    source("supabase/migrations/20260828203123_sanitize_impossible_planning_appeal_dates.sql"),
  ])

  assert.match(dublin, /upper\(eircode_prefix\), date_of_sale desc/)
  assert.match(appeals, /appeal_lodged_date > current_date \+ interval '2 years'/)
  assert.match(appeals, /appeal_decision_date > current_date \+ interval '2 years'/)
  assert.match(appeals, /planning_revalidation_queue/)
  assert.match(appeals, /planning_canonical_events/)
})
