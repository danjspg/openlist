import fs from "node:fs"
import { createClient } from "@supabase/supabase-js"

const dataset = process.argv[2]
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !serviceRoleKey) throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required")
if (dataset !== "planning" && dataset !== "ppr") throw new Error("Usage: node scripts/verify-dataset-snapshots.mjs <planning|ppr>")

const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } })
const DUBLIN_DISTRICT_SLUGS = ["dublin-1","dublin-2","dublin-3","dublin-4","dublin-5","dublin-6","dublin-6w","dublin-7","dublin-8","dublin-9","dublin-10","dublin-11","dublin-12","dublin-13","dublin-14","dublin-15","dublin-16","dublin-18","dublin-22","dublin-24"]

class IntegrityMismatch extends Error {
  constructor(message, repairScope) {
    super(message)
    this.name = "IntegrityMismatch"
    this.repairScope = repairScope
  }
}

function output(name, value) {
  if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `${name}=${value}\n`)
}

function transient(error) {
  const text = `${error?.code || ""} ${error?.message || ""} ${error?.details || ""}`.toLowerCase()
  return error?.code === "57014" || text.includes("statement timeout") || text.includes("canceling statement") || text.includes("connection") || text.includes("fetch failed") || text.includes("timeout")
}

function assertSnapshotMatches(label, snapshot, actual, repairScope) {
  const snapshotCount = Number(snapshot?.totalCount ?? snapshot?.sales_count ?? 0)
  const snapshotLatestDate = snapshot?.latestRegistrationDate ?? snapshot?.latest_sale_date ?? null
  if (snapshotCount !== actual.count || snapshotLatestDate !== actual.latestDate) {
    throw new IntegrityMismatch(`${label} snapshot is stale: snapshot count/date ${snapshotCount}/${snapshotLatestDate}, actual ${actual.count}/${actual.latestDate}`, repairScope)
  }
}

async function verifyPlanningSnapshots() {
  const [{ data: snapshots, error: snapshotError }, { data: facts, error: factsError }] = await Promise.all([
    supabase.from("planning_dashboard_snapshots").select("authority_code,payload,refreshed_at"),
    supabase.rpc("openlist_planning_snapshot_integrity_facts"),
  ])
  if (snapshotError) throw snapshotError
  if (factsError) throw factsError

  const snapshotByAuthority = new Map((snapshots ?? []).map((row) => [row.authority_code, row]))
  const factsByAuthority = new Map((facts ?? []).map((row) => [row.authority_code, { count: Number(row.row_count ?? 0), latestDate: row.latest_registration_date ?? null }]))
  const national = factsByAuthority.get("NATIONAL")
  if (!national) throw new IntegrityMismatch("Planning integrity facts did not return NATIONAL", "planning")

  for (const [authorityCode, actual] of factsByAuthority) {
    const snapshot = snapshotByAuthority.get(authorityCode)
    if (!snapshot) throw new IntegrityMismatch(`Missing ${authorityCode} planning dashboard snapshot`, "planning")
    assertSnapshotMatches(`${authorityCode} planning`, snapshot.payload, actual, "planning")
  }

  const extra = [...snapshotByAuthority.keys()].filter((code) => !factsByAuthority.has(code))
  if (extra.length) throw new IntegrityMismatch(`Planning dashboard has snapshot authorities absent from source facts: ${extra.join(", ")}`, "planning")
  console.log(`Planning snapshots verified in one grouped source scan: ${national.count} applications through ${national.latestDate}; ${factsByAuthority.size - 1} authority snapshots match.`)
}

async function verifyDublinDistrictSnapshots() {
  const { data, error } = await supabase.from("ppr_market_insights").select("market_slug,total_sales_count,last_sale_date").eq("range_key", "last-year").in("market_slug", DUBLIN_DISTRICT_SLUGS)
  if (error) throw error
  const bySlug = new Map((data ?? []).map((row) => [row.market_slug, row]))
  const missing = DUBLIN_DISTRICT_SLUGS.filter((slug) => !bySlug.has(slug))
  const empty = DUBLIN_DISTRICT_SLUGS.filter((slug) => Number(bySlug.get(slug)?.total_sales_count ?? 0) <= 0)
  if (missing.length || empty.length) {
    const bits = []
    if (missing.length) bits.push(`missing: ${missing.join(", ")}`)
    if (empty.length) bits.push(`empty: ${empty.join(", ")}`)
    throw new IntegrityMismatch(`Dublin district PPR snapshots invalid (${bits.join("; ")})`, "dublin")
  }
  console.log(`Dublin district snapshots verified: ${DUBLIN_DISTRICT_SLUGS.length} populated districts.`)
}

async function verifyPprSnapshots() {
  const [{ data: snapshot, error: snapshotError }, { data: facts, error: factsError }] = await Promise.all([
    supabase.from("ppr_national_snapshots").select("sales_count,latest_sale_date,updated_at").eq("range_key", "all").maybeSingle(),
    supabase.rpc("openlist_ppr_snapshot_integrity_facts"),
  ])
  if (snapshotError) throw snapshotError
  if (factsError) throw factsError
  if (!snapshot) throw new IntegrityMismatch("Missing all-time PPR national snapshot", "ppr-national")
  const actual = { count: Number(facts?.count ?? 0), latestDate: facts?.latestDate ?? null }
  assertSnapshotMatches("PPR national", snapshot, actual, "ppr-national")
  await verifyDublinDistrictSnapshots()
  console.log(`PPR snapshot verified: ${actual.count} sales through ${actual.latestDate}.`)
}

try {
  if (dataset === "planning") await verifyPlanningSnapshots()
  else await verifyPprSnapshots()
  output("classification", "healthy")
  output("repair_scope", "none")
} catch (error) {
  if (error instanceof IntegrityMismatch) {
    output("classification", "mismatch")
    output("repair_scope", error.repairScope)
    console.error(`VERIFIED_MISMATCH: ${error.message}`)
    process.exitCode = 2
  } else if (transient(error)) {
    output("classification", "unavailable")
    output("repair_scope", "none")
    console.error(`VERIFICATION_UNAVAILABLE: ${error?.message || error}`)
    process.exitCode = 3
  } else {
    output("classification", "error")
    output("repair_scope", "none")
    console.error(error)
    process.exitCode = 1
  }
}
