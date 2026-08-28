import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

async function source(path: string) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8")
}

test("server-side Supabase reads retry only safe transient read failures", async () => {
  const supabase = await source("lib/supabase.ts")

  assert.match(supabase, /method === "GET" \|\| method === "HEAD"/)
  assert.match(supabase, /body\.includes\("schema cache"\)/)
  assert.match(supabase, /body\.includes\("connection pool"\)/)
  assert.match(supabase, /attempt < 3/)
  assert.match(supabase, /fetch: resilientServerFetch/)
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
  const sitemap = await source("app/sitemap.ts")

  assert.match(sitemap, /"\/planning\/categories"/)
  assert.match(sitemap, /getPlanningPublicCategorySummaries\(3\)/)
  assert.match(sitemap, /planningCategoryRoutes/)
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
    source("supabase/migrations/20260828213000_optimize_ppr_dublin_district_refresh.sql"),
    source("supabase/migrations/20260828213500_sanitize_impossible_planning_appeal_dates.sql"),
  ])

  assert.match(dublin, /upper\(eircode_prefix\), date_of_sale desc/)
  assert.match(appeals, /appeal_lodged_date > current_date \+ interval '2 years'/)
  assert.match(appeals, /appeal_decision_date > current_date \+ interval '2 years'/)
  assert.match(appeals, /planning_revalidation_queue/)
  assert.match(appeals, /planning_canonical_events/)
})
