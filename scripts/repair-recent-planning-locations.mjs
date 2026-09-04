import { createClient } from "@supabase/supabase-js"
import { upsertPlanningLocationSidecar } from "./planning-location-sidecar.mjs"

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!supabaseUrl || !serviceRoleKey) throw new Error("Missing Supabase credentials")

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
})

const SOURCE_URL = "https://services.arcgis.com/NzlPQPKn5QF9v2US/ArcGIS/rest/services/IrishPlanningApplications/FeatureServer/0/query"
const DAYS = Math.min(30, Math.max(1, Number(process.env.PLANNING_LOCATION_REPAIR_DAYS || 14)))
const LIMIT = Math.min(250, Math.max(1, Number(process.env.PLANNING_LOCATION_REPAIR_LIMIT || 100)))
const REQUEST_DELAY_MS = Math.max(0, Number(process.env.PLANNING_LOCATION_REPAIR_DELAY_MS || 250))

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const dateOnly = (date) => date.toISOString().slice(0, 10)
const sqlString = (value) => String(value).replaceAll("'", "''")

async function loadRecentMissingRows() {
  const since = new Date()
  since.setUTCDate(since.getUTCDate() - DAYS)

  const { data: recent, error: recentError } = await supabase
    .from("planning_applications")
    .select("id,local_authority,local_authority_code,reference,registration_date,grid_easting,grid_northing")
    .gte("registration_date", dateOnly(since))
    .order("registration_date", { ascending: false })
    .limit(1000)
  if (recentError) throw recentError
  if (!recent?.length) return []

  const ids = recent.map((row) => row.id)
  const { data: locations, error: locationsError } = await supabase
    .from("planning_application_locations")
    .select("application_id")
    .in("application_id", ids)
  if (locationsError) throw locationsError

  const existing = new Set((locations || []).map((row) => row.application_id))
  return recent.filter((row) => !existing.has(row.id)).slice(0, LIMIT)
}

async function sourceCoordinates(row) {
  const where = `PlanningAuthority = '${sqlString(row.local_authority)}' AND ApplicationNumber = '${sqlString(row.reference)}'`
  const params = new URLSearchParams({
    where,
    outFields: "ApplicationNumber,ITMEasting,ITMNorthing",
    returnGeometry: "true",
    outSR: "2157",
    resultRecordCount: "2",
    f: "json",
  })
  if (REQUEST_DELAY_MS) await sleep(REQUEST_DELAY_MS)
  const response = await fetch(`${SOURCE_URL}?${params}`, {
    headers: { "User-Agent": "OpenList recent planning location repair" },
  })
  if (!response.ok) throw new Error(`ArcGIS HTTP ${response.status}`)
  const payload = await response.json()
  if (payload.error) throw new Error(payload.error.message || "ArcGIS query failed")
  if (!Array.isArray(payload.features) || payload.features.length !== 1) return null
  const feature = payload.features[0]
  const easting = Number(feature.attributes?.ITMEasting ?? feature.geometry?.x)
  const northing = Number(feature.attributes?.ITMNorthing ?? feature.geometry?.y)
  if (!Number.isFinite(easting) || !Number.isFinite(northing)) return null
  return { ...row, grid_easting: easting, grid_northing: northing }
}

const missing = await loadRecentMissingRows()
let repaired = 0
let unavailable = 0
let failed = 0

for (const row of missing) {
  try {
    const candidate =
      Number.isFinite(Number(row.grid_easting)) && Number.isFinite(Number(row.grid_northing))
        ? row
        : await sourceCoordinates(row)
    if (!candidate) {
      unavailable += 1
      continue
    }
    const result = await upsertPlanningLocationSidecar(
      supabase,
      [candidate],
      `${row.local_authority_code} ${row.reference}`,
      "recent_location_repair"
    )
    repaired += result.stored
  } catch (error) {
    failed += 1
    console.warn(`${row.local_authority_code} ${row.reference}: ${error instanceof Error ? error.message : String(error)}`)
  }
}

console.log(JSON.stringify({ checked: missing.length, repaired, unavailable, failed, days: DAYS, limit: LIMIT }))
if (failed > 0) process.exitCode = 1
