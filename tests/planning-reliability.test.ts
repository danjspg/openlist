import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import path from "node:path"
import test from "node:test"

const root = process.cwd()

async function source(file: string) {
  return readFile(path.join(root, file), "utf8")
}

test("planning detail route and all of its cache dependencies have no timed expiry", async () => {
  const [route, planning, research] = await Promise.all([
    source("app/planning/[authority]/[reference]/page.tsx"),
    source("lib/planning.ts"),
    source("lib/property-research.ts"),
  ])
  assert.match(route, /export const revalidate = false/)
  assert.match(route, /dynamicParams = true/)
  assert.match(route, /generateStaticParams\(\)[\s\S]*return \[\]/)
  assert.match(planning, /planning-application[\s\S]*revalidate: PLANNING_DETAIL_CACHE_REVALIDATE/)
  assert.match(planning, /planning-application-events[\s\S]*revalidate: PLANNING_DETAIL_CACHE_REVALIDATE/)
  assert.match(planning, /const PLANNING_DETAIL_CACHE_REVALIDATE = false/)
  assert.match(research, /const PLANNING_RESEARCH_REVALIDATE = false/)
  assert.match(research, /const PPR_AREA_CANDIDATE_REVALIDATE = false/)
})

test("planning source failures throw instead of becoming missing records or empty timelines", async () => {
  const planning = await source("lib/planning.ts")
  assert.match(planning, /if \(error\) throw new Error\(`Planning application query failed:/)
  assert.match(planning, /if \(!data\) return null/)
  assert.match(planning, /if \(error\) throw new Error\(`Planning timeline query failed:/)
  assert.doesNotMatch(planning, /Planning timeline query failed\.[\s\S]{0,120}return \[\]/)
})

test("normal upserts enqueue only changed/new records and the queue migration is bounded", async () => {
  const [upsert, diff, migration] = await Promise.all([
    source("scripts/planning-upsert.mjs"),
    source("lib/planning-ingestion-diff.mjs"),
    source("supabase/migrations/20260819110000_add_planning_revalidation_queue.sql"),
  ])
  assert.match(upsert, /revalidation_pending: true/)
  assert.doesNotMatch(diff, /revalidation_pending/)
  assert.match(migration, /revalidation_pending boolean not null default false/)
  assert.match(migration, /where revalidation_pending = true/)
})

test("revalidation worker is exact-path, bounded, race-safe, and leaves failures pending", async () => {
  const [worker, route, workflow, drain] = await Promise.all([
    source("lib/planning-revalidation.ts"),
    source("app/api/internal/planning-revalidate/route.ts"),
    source(".github/workflows/planning-refresh.yml"),
    source("scripts/drain-planning-revalidation.mjs"),
  ])
  assert.match(worker, /Math\.min\(batchSize, 100\)/)
  assert.match(worker, /invalidatePath\(planningApplicationPath\(authority, row\.reference\)\)/)
  assert.match(worker, /\.eq\("updated_at", row\.updated_at\)/)
  assert.match(worker, /if \(cleared\?\.length\) invalidated \+= 1/)
  assert.match(route, /PLANNING_REVALIDATION_SECRET/)
  assert.match(route, /revalidatePath/)
  assert.doesNotMatch(worker, /revalidatePath\("\/planning/)
  assert.match(workflow, /drain-planning-revalidation\.mjs/)
  assert.match(drain, /maxBatches = 20/)
  assert.match(drain, /result\.failures > 0/)
})
