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

test("normal upserts populate spatial sidecar and use the dedicated exact-path revalidation queue", async () => {
  const [upsert, diff] = await Promise.all([
    source("scripts/planning-upsert.mjs"),
    source("lib/planning-ingestion-diff.mjs"),
  ])
  assert.doesNotMatch(upsert, /revalidation_pending: true/)
  assert.match(upsert, /\.from\("planning_revalidation_queue"\)/)
  assert.match(upsert, /application_id: row\.id/)
  assert.match(upsert, /requested_at: requestedAt/)
  assert.match(upsert, /onConflict: "application_id"/)
  assert.match(upsert, /\.select\("id,local_authority_code,reference,proposal,applicant_name,application_type,status,normalized_status,decision_date,final_grant_date,withdrawal_date,appeal_decision_date,grid_easting,grid_northing"\)/)
  assert.match(upsert, /upsertPlanningLocationSidecar\(supabase, rows, label\)/)
  assert.match(upsert, /classifyAndPersistPlanningApplications/)
  assert.match(upsert, /enqueue: false/)
  assert.match(upsert, /bounded active\/recent reconciliation/)
  assert.doesNotMatch(diff, /revalidation_pending/)
})

test("revalidation worker is exact-path, bounded, race-safe, and uses one queue", async () => {
  const [worker, route, workflow, drain] = await Promise.all([
    source("lib/planning-revalidation.ts"),
    source("app/api/internal/planning-revalidate/route.ts"),
    source(".github/workflows/planning-revalidate.yml"),
    source("scripts/drain-planning-revalidation.mjs"),
  ])
  assert.match(worker, /Math\.min\(batchSize, 100\)/)
  assert.match(worker, /invalidatePath\(planningApplicationPath\(authority, related\.reference\)\)/)
  assert.match(worker, /\.eq\("requested_at", item\.requested_at\)/)
  assert.match(worker, /if \(cleared\?\.length\) invalidated \+= 1/)
  assert.doesNotMatch(worker, /revalidation_pending|dedicatedOnly|legacyLimit/)
  assert.match(route, /PLANNING_REVALIDATION_SECRET/)
  assert.match(route, /revalidatePath/)
  assert.doesNotMatch(route, /queue=|dedicatedOnly/)
  assert.doesNotMatch(worker, /revalidatePath\("\/planning/)
  assert.match(workflow, /drain-planning-revalidation\.mjs/)
  assert.match(workflow, /name: Drain bounded exact-path Planning revalidation queue/)
  assert.match(workflow, /cron: "47 \* \* \* \*"/)
  assert.match(drain, /maxBatches = 20/)
  assert.match(drain, /maxConsecutiveFailedBatches = 3/)
  assert.match(drain, /consecutiveFailedBatches \+= 1/)
  assert.match(drain, /consecutiveFailedBatches >= maxConsecutiveFailedBatches/)
  assert.match(drain, /consecutiveFailedBatches = 0/)
  assert.doesNotMatch(drain, /PLANNING_REVALIDATION_QUEUE|queue=/)
})
