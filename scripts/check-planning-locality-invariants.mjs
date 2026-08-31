import { createClient } from "@supabase/supabase-js"

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) throw new Error("Supabase service credentials are required")

const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
const expectedMemberships = Number(process.env.PLANNING_LOCALITY_EXPECTED_MEMBERSHIPS || 2358)
const maxAgeHours = Number(process.env.PLANNING_LOCALITY_MAX_SNAPSHOT_AGE_HOURS || 36)
const staleBefore = Date.now() - maxAgeHours * 60 * 60 * 1000

const memberships = []
for (let offset = 0; ; offset += 1000) {
  const { data, error } = await supabase
    .from("locality_seo_memberships")
    .select("canonical_path,authority_code,locality_slug,seo_tier,activity_refreshed_at")
    .eq("surface", "planning")
    .is("left_at", null)
    .order("id")
    .range(offset, offset + 999)

  if (error) throw error
  memberships.push(...(data || []))
  if ((data || []).length < 1000) break
}

const paths = new Map()
let priority = 0
let expanded = 0
let staleSnapshots = 0
let missingAuthority = 0

for (const row of memberships) {
  paths.set(row.canonical_path, (paths.get(row.canonical_path) || 0) + 1)
  if (row.seo_tier === "priority") priority += 1
  else if (row.seo_tier === "expanded") expanded += 1

  const refreshedAt = row.activity_refreshed_at ? Date.parse(row.activity_refreshed_at) : Number.NaN
  if (!Number.isFinite(refreshedAt) || refreshedAt < staleBefore) staleSnapshots += 1
  if (!row.authority_code) missingAuthority += 1
}

const duplicatePaths = [...paths.values()].filter((count) => count > 1).length
const { data: aggregatePlaces, error: aggregateError } = await supabase
  .from("planning_canonical_places")
  .select("slug")
  .eq("aggregate_enabled", true)
if (aggregateError) throw aggregateError

const report = {
  generatedAt: new Date().toISOString(),
  expectedMemberships,
  memberships: memberships.length,
  distinctPaths: paths.size,
  duplicatePaths,
  priority,
  expanded,
  staleSnapshotHours: maxAgeHours,
  staleSnapshots,
  missingAuthority,
  enabledAggregatePlaces: (aggregatePlaces || []).map((row) => row.slug).sort(),
}

console.log(JSON.stringify(report, null, 2))

const failures = []
if (memberships.length !== expectedMemberships) failures.push(`membership count ${memberships.length} != expected ${expectedMemberships}`)
if (duplicatePaths !== 0) failures.push(`${duplicatePaths} duplicate canonical paths`)
if (priority + expanded !== memberships.length) failures.push(`SEO tier coverage ${priority + expanded}/${memberships.length}`)
if (staleSnapshots !== 0) failures.push(`${staleSnapshots} locality snapshots older than ${maxAgeHours}h or never refreshed`)
if (missingAuthority !== 0) failures.push(`${missingAuthority} planning locality memberships have no authority`)

if (failures.length) throw new Error(`Planning locality invariant failure: ${failures.join("; ")}`)
