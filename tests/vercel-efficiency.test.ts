import assert from "node:assert/strict"
import test from "node:test"
import { readFile } from "node:fs/promises"

async function source(path: string) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8")
}

test("public root rendering does not read auth cookies", async () => {
  const [layout, nav, sessionRoute, privateViewings] = await Promise.all([
    source("app/layout.tsx"),
    source("components/Nav.tsx"),
    source("app/api/auth/session/route.ts"),
    source("app/my-viewings/page.tsx"),
  ])

  assert.doesNotMatch(layout, /getCurrentUser|cookies\(/)
  assert.match(layout, /AuthStateProvider/)
  assert.match(nav, /useAuthState/)
  assert.match(sessionRoute, /getCurrentUser/)
  assert.match(sessionRoute, /private, no-store/)
  assert.match(privateViewings, /requireUser/)
})

test("planning aggregation stays in Postgres and returns only compact summaries", async () => {
  const [planning, migration] = await Promise.all([
    source("lib/planning.ts"),
    source(
      "supabase/migrations/20260810120000_add_planning_dashboard_aggregate.sql"
    ),
  ])

  assert.match(planning, /openlist_planning_dashboard_aggregate/)
  assert.doesNotMatch(planning, /getPlanningAggregateRows/)
  assert.doesNotMatch(planning, /PLANNING_AGGREGATE_PAGE_SIZE/)
  assert.match(migration, /with filtered as materialized/i)
  assert.match(migration, /jsonb_build_object/i)
  assert.match(migration, /group by area_label/i)
})

test("planning research and sold-area support queries use central caches", async () => {
  const research = await source("lib/property-research.ts")
  const detail = await source("app/planning/[authority]/[reference]/page.tsx")
  const soldArea = await source("app/sold-prices/[county]/[areaSlug]/page.tsx")

  assert.match(research, /planning-research-context/)
  assert.match(research, /planning-ppr-area-candidates/)
  assert.match(research, /planning-applications-for-sold-price-area/)
  assert.match(detail, /generateStaticParams\(\)/)
  assert.match(soldArea, /generateStaticParams\(\)/)
})

test("Eircode fallbacks use bounded routing-key queries instead of broad county text", async () => {
  const [eircode, research, migration] = await Promise.all([
    source("lib/eircode-intelligence.ts"),
    source("lib/property-research.ts"),
    source(
      "supabase/migrations/20260812120000_add_planning_eircode_prefix.sql"
    ),
  ])

  assert.match(eircode, /findRecentRoutingKeySales/)
  assert.doesNotMatch(eircode, /getRecentPlanningApplicationsForCounty/)
  assert.doesNotMatch(eircode, /getPlanningApplicationsForSoldPriceArea/)
  assert.match(research, /\.eq\("eircode_prefix", routingKey\)/)
  assert.match(research, /localityCandidateLimit/)
  assert.match(migration, /planning_applications_eircode_prefix_date_idx/)
})

test("exact place searches load sold prices through indexed area fields", async () => {
  const unified = await source("lib/unified-search.ts")

  assert.match(unified, /selectUniqueExactPlaceSuggestion/)
  assert.match(unified, /\.eq\("county", exactPlace\.county\)/)
  assert.match(unified, /\.eq\("area_slug", exactPlace\.areaSlug\)/)
  assert.match(unified, /\.limit\(6\)/)
})

test("sitemap timestamps come from planning records rather than build time", async () => {
  const sitemap = await source("app/sitemap.ts")

  assert.doesNotMatch(sitemap, /const now = new Date\(\)/)
  assert.match(sitemap, /application\.updated_at \|\| application\.registration_date/)
})
