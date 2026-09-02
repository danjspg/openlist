import assert from "node:assert/strict"
import { mkdtemp, readFile, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import test from "node:test"
import rawSnapshots from "../data/sitemap-snapshots.json" with { type: "json" }
import rootSitemap, { dynamic as rootDynamic } from "../app/sitemap"
import { GET as getPlanningNotable, dynamic as notableDynamic } from "../app/sitemaps/planning-notable.xml/route"
import { GET as getSoldLocalities, dynamic as soldDynamic } from "../app/sitemaps/sold-prices-localities.xml/route"
import { GET as getPlanningPriority, dynamic as priorityDynamic } from "../app/sitemaps/planning-localities.xml/route"
import { GET as getPlanningExpanded, dynamic as expandedDynamic } from "../app/sitemaps/planning-localities-expanded.xml/route"
import { refreshSitemapSnapshotFile, staleSnapshotIsActionable } from "../lib/sitemap-snapshot-refresh"
import { parseSitemapSnapshotSet } from "../lib/sitemap-snapshot"

async function source(path: string) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8")
}

test("all database-backed sitemap routes are dynamic and snapshot-only", async () => {
  assert.deepEqual(
    [rootDynamic, notableDynamic, soldDynamic, priorityDynamic, expandedDynamic],
    Array(5).fill("force-dynamic")
  )

  const routeSources = await Promise.all([
    source("app/sitemap.ts"),
    source("app/sitemaps/planning-notable.xml/route.ts"),
    source("app/sitemaps/sold-prices-localities.xml/route.ts"),
    source("app/sitemaps/planning-localities.xml/route.ts"),
    source("app/sitemaps/planning-localities-expanded.xml/route.ts"),
  ])
  for (const route of routeSources) {
    assert.doesNotMatch(route, /getServerSupabase|\.rpc\(|\.from\(|@\/lib\/(?:locality-seo|planning["'])/)
    assert.match(route, /sitemap-snapshots\.json/)
  }
})

test("snapshot-backed sitemap requests render without Supabase", async () => {
  process.env.NEXT_PUBLIC_SITE_URL = "https://snapshot-test.openlist.ie"
  const snapshots = parseSitemapSnapshotSet(rawSnapshots)
  const root = await rootSitemap()
  assert.ok(root.length >= snapshots.sitemaps.root.entries.length)

  for (const get of [getPlanningNotable, getSoldLocalities, getPlanningPriority, getPlanningExpanded]) {
    const response = await get()
    assert.equal(response.status, 200)
    assert.match(response.headers.get("content-type") || "", /application\/xml/)
    assert.equal(response.headers.get("x-openlist-sitemap-snapshot"), snapshots.generatedAt)
    assert.match(await response.text(), /<urlset/)
  }
})

test("Planning locality snapshots preserve the full disjoint universe", () => {
  const snapshots = parseSitemapSnapshotSet(rawSnapshots)
  const priority = snapshots.sitemaps.planningLocalitiesPriority.entries
  const expanded = snapshots.sitemaps.planningLocalitiesExpanded.entries
  assert.ok(snapshots.planningLocalityUniverseSize >= 2000)
  assert.equal(priority.length + expanded.length, snapshots.planningLocalityUniverseSize)
  const priorityPaths = new Set(priority.map((entry) => entry.path))
  assert.equal(expanded.some((entry) => priorityPaths.has(entry.path)), false)
})

test("failed snapshot refresh serves and preserves last-known-good data", async () => {
  const directory = await mkdtemp(join(tmpdir(), "openlist-sitemap-test-"))
  const path = join(directory, "sitemap-snapshots.json")
  const staleText = `${JSON.stringify(rawSnapshots)}\n`
  await writeFile(path, staleText, "utf8")

  const result = await refreshSitemapSnapshotFile(path, async () => {
    throw new Error("simulated database outage")
  })

  assert.equal(result.status, "stale")
  assert.equal(result.snapshot.generatedAt, rawSnapshots.generatedAt)
  assert.equal(await readFile(path, "utf8"), staleText)
})

test("temporary snapshot unavailability is actionable only after last-known-good data ages out", () => {
  const now = Date.parse("2026-09-02T12:00:00.000Z")
  assert.equal(staleSnapshotIsActionable({ generatedAt: "2026-09-01T12:00:00.000Z" }, now), false)
  assert.equal(staleSnapshotIsActionable({ generatedAt: "2026-08-29T11:59:59.000Z" }, now), true)
})

test("build-time Supabase access is denied and audited", async () => {
  const [supabase, planningLayout, soldLayout, verifier] = await Promise.all([
    source("lib/supabase.ts"),
    source("app/planning/layout.tsx"),
    source("app/sold-prices/layout.tsx"),
    source("scripts/verify-build-no-supabase.mjs"),
  ])
  assert.match(supabase, /\.rest\.retry = false/)
  assert.match(supabase, /NEXT_PHASE === "phase-production-build"/)
  assert.match(supabase, /OPENLIST_SUPABASE_READ_DURING_BUILD/)
  assert.doesNotMatch(planningLayout, /force-dynamic/)
  assert.doesNotMatch(soldLayout, /force-dynamic/)
  assert.match(verifier, /next[\s\S]*build/)
  assert.match(verifier, /OPENLIST_SUPABASE_READ_DURING_BUILD/)
})

test("snapshot generation cannot invoke locality reconstruction", async () => {
  const [generator, categoryDefinitions] = await Promise.all([
    source("scripts/generate-sitemap-snapshots.mts"),
    source("lib/planning-public-category-definitions.ts"),
  ])
  assert.match(generator, /openlist_planning_locality_sitemap/)
  assert.match(generator, /new Client/)
  assert.match(generator, /limit 3/)
  assert.match(generator, /planning_seo_notable_categories_gin_idx|notable_categories @>/)
  assert.doesNotMatch(generator, /openlist_planning_public_category_index/)
  assert.doesNotMatch(generator, /createClient|@supabase\/supabase-js/)
  assert.doesNotMatch(categoryDefinitions, /getServerSupabase|next\/cache|@supabase/)
  assert.doesNotMatch(generator, /openlist_refresh_locality_seo_cohorts/)
  assert.doesNotMatch(generator, /openlist_refresh_planning_locality_activity_counts/)
  assert.doesNotMatch(generator, /openlist_planning_locality\(/)
})
