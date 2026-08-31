import { resolve } from "node:path"
import { Client } from "pg"
import {
  planningPublicCategorySummariesFromSource,
  type PlanningPublicCategorySourceRow,
} from "@/lib/planning-public-categories"
import {
  buildPlanningSitemapEntries,
  NOTABLE_PLANNING_SITEMAP_LIMIT,
  RECENT_PLANNING_SITEMAP_LIMIT,
  type PlanningSitemapApplication,
} from "@/lib/planning-seo"
import { LOCALITY_COHORT_SIZE } from "@/lib/locality-seo-core"
import { refreshSitemapSnapshotFile } from "@/lib/sitemap-snapshot-refresh"
import {
  SITEMAP_SNAPSHOT_VERSION,
  type SitemapSnapshotEntry,
  type SitemapSnapshotSet,
} from "@/lib/sitemap-snapshot"

const databaseUrl = process.env.SUPABASE_DB_URL
if (!databaseUrl) throw new Error("SUPABASE_DB_URL is required")

const postgres = new Client({ connectionString: databaseUrl })
const targetPath = resolve("data/sitemap-snapshots.json")

const result = await refreshSitemapSnapshotFile(targetPath, async () => {
  await postgres.connect()
  try {
    await postgres.query("set statement_timeout = '20s'")
    await postgres.query("set lock_timeout = '3s'")
    return await generateSnapshotSet(postgres)
  } finally {
    await postgres.end()
  }
})
if (result.status === "stale") {
  console.error("Sitemap snapshot refresh failed; the last-known-good file was preserved.", result.error)
  process.exitCode = 1
} else {
  const counts = Object.fromEntries(Object.entries(result.snapshot.sitemaps).map(([name, snapshot]) => [name, snapshot.entries.length]))
  console.log(JSON.stringify({ generatedAt: result.snapshot.generatedAt, counts, planningLocalityUniverseSize: result.snapshot.planningLocalityUniverseSize }, null, 2))
}

async function generateSnapshotSet(client: Client): Promise<SitemapSnapshotSet> {
  const generatedAt = new Date().toISOString()

  // Deliberately sequential: sitemap maintenance must never create a burst of
  // concurrent catalog or application queries on the shared production DB.
  const aggregatePlaces = await queryRows<{ slug: string; updated_at: string | null }>(client,
    "select slug, updated_at from public.planning_canonical_places where aggregate_enabled = true order by display_name")

  const categorySource = await queryRows<PlanningPublicCategorySourceRow>(client,
    "select * from public.openlist_planning_public_category_index(false, 50000)")
  const categories = planningPublicCategorySummariesFromSource(categorySource, 3)

  const recent = await queryRows<PlanningSitemapApplication>(client, `
    select p.id, p.local_authority_code, p.reference, p.registration_date, p.updated_at
    from public.planning_seo_sitemap_memberships m
    join public.planning_applications p on p.id = m.application_id
    where m.cohort = 'recent' and m.left_at is null
    order by p.registration_date desc, p.reference desc, p.id desc
    limit $1
  `, [RECENT_PLANNING_SITEMAP_LIMIT])
  const notable = await queryRows<PlanningSitemapApplication>(client, `
    select p.id, p.local_authority_code, p.reference, p.registration_date, p.updated_at
    from public.planning_seo_sitemap_memberships m
    join public.planning_applications p on p.id = m.application_id
    where m.cohort = 'notable' and m.left_at is null
    order by m.first_seen_at, p.local_authority_code, p.reference, p.id
    limit $1
  `, [NOTABLE_PLANNING_SITEMAP_LIMIT])
  const soldLocalities = await queryRows<LocalityRow>(client,
    "select * from public.openlist_locality_seo_sitemap('sold_prices', $1)", [LOCALITY_COHORT_SIZE])
  const priorityLocalities = await queryRows<LocalityRow>(client,
    "select * from public.openlist_planning_locality_sitemap('priority', 3000)")
  const expandedLocalities = await queryRows<LocalityRow>(client,
    "select * from public.openlist_planning_locality_sitemap('expanded', 3000)")

  const [{ count: planningLocalityUniverseSize }] = await queryRows<{ count: number }>(client,
    "select count(*)::integer as count from public.locality_seo_memberships where surface = 'planning' and left_at is null")
  if (!planningLocalityUniverseSize) throw new Error("Planning locality universe is empty")

  const rootEntries = deduplicate([
    ...aggregatePlaces.map((place) => entry(`/planning/areas/${place.slug}`, place.updated_at)),
    ...categories.map((category) => entry(`/planning/categories/${category.slug}`)),
    ...planningApplicationEntries(recent),
  ])

  const snapshot = (entries: SitemapSnapshotEntry[]) => ({ generatedAt, entries: deduplicate(entries) })
  return {
    version: SITEMAP_SNAPSHOT_VERSION,
    generatedAt,
    planningLocalityUniverseSize,
    sitemaps: {
      root: snapshot(rootEntries),
      planningNotable: snapshot(planningApplicationEntries(notable)),
      soldPricesLocalities: snapshot(soldLocalities.map(localityEntry)),
      planningLocalitiesPriority: snapshot(priorityLocalities.map(localityEntry)),
      planningLocalitiesExpanded: snapshot(expandedLocalities.map(localityEntry)),
    },
  }
}

type LocalityRow = { canonical_path: string; last_modified: string | null }

function localityEntry(row: LocalityRow) {
  return entry(row.canonical_path, row.last_modified)
}

function planningApplicationEntries(applications: PlanningSitemapApplication[]) {
  return buildPlanningSitemapEntries(applications, "https://snapshot.openlist.invalid").map((item) => {
    const path = new URL(item.url).pathname
    return entry(path, item.lastModified?.toISOString())
  })
}

function entry(path: string, lastModified?: string | null): SitemapSnapshotEntry {
  return { path, ...(lastModified ? { lastModified: new Date(lastModified).toISOString() } : {}) }
}

function deduplicate(entries: SitemapSnapshotEntry[]) {
  return [...new Map(entries.map((item) => [item.path, item])).values()]
}

async function queryRows<T>(client: Client, text: string, values: unknown[] = []) {
  const result = await client.query(text, values)
  return result.rows as T[]
}
