import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

async function source(path: string) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8")
}

test("common Planning dashboards read a maintained compact snapshot", async () => {
  const [planning, migration, securityMigration, workflow] = await Promise.all([
    source("lib/planning.ts"),
    source("supabase/migrations/20260822081145_add_planning_dashboard_snapshots.sql"),
    source("supabase/migrations/20260822082707_revoke_public_planning_dashboard_snapshot_functions.sql"),
    source(".github/workflows/planning-refresh.yml"),
  ])

  assert.match(planning, /openlist_planning_dashboard_snapshot/)
  assert.doesNotMatch(planning, /openlist_planning_dashboard_aggregate/)
  assert.match(migration, /create table if not exists public\.planning_dashboard_snapshots/i)
  assert.match(migration, /on conflict \(authority_code\) do update/i)
  assert.match(securityMigration, /from public, anon, authenticated/i)
  assert.match(workflow, /refresh-planning-dashboard-snapshots\.mjs/)
})

test("missing PPR analytics snapshots cannot trigger an unbounded web fallback", async () => {
  const analytics = await source("lib/ppr-analytics.ts")

  assert.doesNotMatch(analytics, /getMarketInsightsUncached/)
  assert.doesNotMatch(analytics, /getAreaInsightsUncached/)
  assert.match(analytics, /emptyLocationInsights\(\)/)
  assert.match(analytics, /getRecentMarketSales/)
  assert.match(analytics, /getRecentAreaSales/)
})

test("the production route benchmark remains low-rate and public-only", async () => {
  const benchmark = await source("scripts/benchmark-production-routes.mjs")

  assert.match(benchmark, /OPENLIST_BENCHMARK_SAMPLES/)
  assert.match(benchmark, /OPENLIST_BENCHMARK_DELAY_MS/)
  assert.match(benchmark, /\/planning\/cork\/areas\/carrigaline/)
  assert.match(benchmark, /\/sold-prices\/cork\/carrigaline/)
  assert.doesNotMatch(benchmark, /--request|(?:-X\s*)(?:POST|PUT|PATCH|DELETE)/)
})
