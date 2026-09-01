import assert from "node:assert/strict"
import test from "node:test"
import { readFile } from "node:fs/promises"

async function source(path: string) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8")
}

test("public root rendering does not read auth cookies", async () => {
  const [layout, nav, footer, sessionRoute, privateViewings] = await Promise.all([
    source("app/layout.tsx"),
    source("components/Nav.tsx"),
    source("components/AccountFooterLink.tsx"),
    source("app/api/auth/session/route.ts"),
    source("app/my-viewings/page.tsx"),
  ])

  assert.doesNotMatch(layout, /getCurrentUser|cookies\(/)
  assert.match(layout, /AuthStateProvider/)
  assert.match(nav, /useAuthState/)
  assert.match(sessionRoute, /getCurrentUser/)
  assert.match(sessionRoute, /private, no-store/)
  assert.match(privateViewings, /requireUser/)
  assert.match(sessionRoute, /from\("viewings"\)[\s\S]*\.eq\("owner_user_id", user\.id\)[\s\S]*\.limit\(1\)/)
  assert.match(sessionRoute, /hasViewings/)
  assert.match(nav, /const \{ isAuthenticated, hasViewings \} = useAuthState\(\)/)
  assert.match(nav, /shouldShowMyViewings\(isAuthenticated, hasViewings\)/)
  assert.match(footer, /const\s+\{ isAuthenticated, hasViewings \} = useAuthState\(\)/)
  assert.match(footer, /shouldShowMyViewings\(isAuthenticated, hasViewings\)/)
})

test("public Planning dashboards consume only maintained compact snapshots", async () => {
  const [planning, migration] = await Promise.all([
    source("lib/planning.ts"),
    source(
      "supabase/migrations/20260810120000_add_planning_dashboard_aggregate.sql"
    ),
  ])

  assert.match(planning, /openlist_planning_dashboard_snapshot/)
  assert.doesNotMatch(planning, /openlist_planning_dashboard_aggregate/)
  assert.doesNotMatch(planning, /getPlanningAggregateRows/)
  assert.doesNotMatch(planning, /PLANNING_AGGREGATE_PAGE_SIZE/)
  assert.match(migration, /with filtered as materialized/i)
  assert.match(migration, /jsonb_build_object/i)
  assert.match(migration, /group by area_label/i)
})

test("planning dashboard aggregate allows the larger national corpus to finish", async () => {
  const migration = await source(
    "supabase/migrations/20260818184500_allow_planning_dashboard_growth.sql"
  )
  assert.match(migration, /openlist_planning_dashboard_aggregate/i)
  assert.match(migration, /statement_timeout\s*=\s*'30s'/i)
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
  const [sitemap, planningSeo] = await Promise.all([
    source("app/sitemap.ts"),
    source("lib/planning-seo.ts"),
  ])

  assert.doesNotMatch(sitemap, /const now = new Date\(\)/)
  assert.match(planningSeo, /application\.updated_at \|\| application\.registration_date/)
})

test("planning sitemap remains explicitly capped independently of database size", async () => {
  const [sitemap, generator, planningSeo] = await Promise.all([
    source("app/sitemap.ts"),
    source("scripts/generate-sitemap-snapshots.mts"),
    source("lib/planning-seo.ts"),
  ])

  assert.match(planningSeo, /RECENT_PLANNING_SITEMAP_LIMIT = 5000/)
  assert.match(sitemap, /snapshots\.sitemaps\.root/)
  assert.match(generator, /\[RECENT_PLANNING_SITEMAP_LIMIT\]/)
})

test("historical result sorting remains database-side and bounded", async () => {
  const [planning, ppr, soldSearch] = await Promise.all([
    source("lib/planning.ts"),
    source("lib/ppr.ts"),
    source("app/sold-prices/search/page.tsx"),
  ])

  assert.match(planning, /filters\.sort === "oldest"/)
  assert.match(planning, /\.order\("registration_date", \{ ascending, nullsFirst: false \}\)/)
  assert.match(planning, /\.limit\(25\)/)
  assert.match(planning, /hasApplicationFilters\s*\? Promise\.resolve\(null\)/)
  assert.doesNotMatch(planning, /Planning filtered aggregation/)
  assert.match(ppr, /sort === "price-high"/)
  assert.match(ppr, /sort === "price-low"/)
  assert.match(ppr, /filters\.dateRange === "all"/)
  assert.match(soldSearch, /index: false/)
})
