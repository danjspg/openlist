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

test("Planning detail supporting context fails soft", async () => {
  const [planning, research, layout] = await Promise.all([
    source("lib/planning.ts"),
    source("lib/property-research.ts"),
    source("app/planning/[authority]/[reference]/layout.tsx"),
  ])

  assert.match(planning, /Planning timeline unavailable[\s\S]*?return \[\] as PlanningEvent\[\]/)
  assert.match(research, /Planning research context unavailable[\s\S]*?matchPlanningLocation\(application, \[\]\)/)
  assert.match(research, /nearbySales: \[\]/)
  assert.match(layout, /Planning notable layout lookup unavailable/)
  assert.match(layout, /Planning notable enrichment unavailable/)
})

test("Planning category metadata avoids full application hydration", async () => {
  const [categories, page] = await Promise.all([
    source("lib/planning-public-categories.ts"),
    source("app/planning/categories/[category]/page.tsx"),
  ])

  assert.match(categories, /export async function getPlanningPublicCategorySummary/)
  assert.match(page, /generateMetadata[\s\S]*?getPlanningPublicCategorySummary\(slug\)/)
})

test("Planning categories are explicitly discoverable in the root sitemap", async () => {
  const [sitemap, generator] = await Promise.all([
    source("app/sitemap.ts"),
    source("scripts/generate-sitemap-snapshots.mts"),
  ])

  assert.match(sitemap, /"\/planning\/categories"/)
  assert.match(sitemap, /snapshots\.sitemaps\.root/)
  assert.match(generator, /planningPublicCategorySummariesFromSource\(categorySource, 3\)/)
  assert.match(generator, /`\/planning\/categories\/\$\{category\.slug\}`/)
})

test("exact Planning revalidation retries transient acknowledgement failures", async () => {
  const revalidation = await source("lib/planning-revalidation.ts")

  assert.match(revalidation, /error\.code === "57014"/)
  assert.match(revalidation, /retryTransientMutation/)
  assert.match(revalidation, /\.delete\(\)[\s\S]*?requested_at/)
  assert.match(revalidation, /\.update\(\{ revalidation_pending: false \}\)[\s\S]*?updated_at/)
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
