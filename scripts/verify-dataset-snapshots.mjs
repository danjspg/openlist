import { createClient } from "@supabase/supabase-js"

const dataset = process.argv[2]
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required")
}

if (dataset !== "planning" && dataset !== "ppr") {
  throw new Error("Usage: node scripts/verify-dataset-snapshots.mjs <planning|ppr>")
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
})

const DUBLIN_DISTRICT_SLUGS = [
  "dublin-1",
  "dublin-2",
  "dublin-3",
  "dublin-4",
  "dublin-5",
  "dublin-6",
  "dublin-6w",
  "dublin-7",
  "dublin-8",
  "dublin-9",
  "dublin-10",
  "dublin-11",
  "dublin-12",
  "dublin-13",
  "dublin-14",
  "dublin-15",
  "dublin-16",
  "dublin-18",
  "dublin-22",
  "dublin-24",
]

async function exactCountAndLatest(table, dateColumn, authorityCode) {
  let countQuery = supabase.from(table).select("id", { count: "exact", head: true })
  let latestQuery = supabase
    .from(table)
    .select(dateColumn)
    .not(dateColumn, "is", null)

  if (authorityCode) {
    countQuery = countQuery.eq("local_authority_code", authorityCode)
    latestQuery = latestQuery.eq("local_authority_code", authorityCode)
  }

  const [countResult, latestResult] = await Promise.all([
    countQuery,
    latestQuery.order(dateColumn, { ascending: false }).limit(1).maybeSingle(),
  ])
  if (countResult.error) throw countResult.error
  if (latestResult.error) throw latestResult.error

  return {
    count: Number(countResult.count ?? 0),
    latestDate: latestResult.data?.[dateColumn] ?? null,
  }
}

function assertSnapshotMatches(label, snapshot, actual) {
  const snapshotCount = Number(snapshot?.totalCount ?? snapshot?.sales_count ?? 0)
  const snapshotLatestDate = snapshot?.latestRegistrationDate ?? snapshot?.latest_sale_date ?? null

  if (snapshotCount !== actual.count || snapshotLatestDate !== actual.latestDate) {
    throw new Error(
      `${label} snapshot is stale: snapshot count/date ${snapshotCount}/${snapshotLatestDate}, ` +
        `actual ${actual.count}/${actual.latestDate}`
    )
  }
}

async function mapWithConcurrency(items, concurrency, worker) {
  const pending = [...items]
  const workers = Array.from({ length: Math.min(concurrency, pending.length) }, async () => {
    while (pending.length > 0) {
      const item = pending.shift()
      await worker(item)
    }
  })
  await Promise.all(workers)
}

async function verifyPlanningSnapshots() {
  const { data: snapshots, error } = await supabase
    .from("planning_dashboard_snapshots")
    .select("authority_code,payload,refreshed_at")
  if (error) throw error

  const snapshotByAuthority = new Map(
    (snapshots ?? []).map((snapshot) => [snapshot.authority_code, snapshot])
  )
  const nationalSnapshot = snapshotByAuthority.get("NATIONAL")
  if (!nationalSnapshot) throw new Error("Missing NATIONAL planning dashboard snapshot")

  const nationalActual = await exactCountAndLatest(
    "planning_applications",
    "registration_date"
  )
  assertSnapshotMatches("NATIONAL planning", nationalSnapshot.payload, nationalActual)

  const authorityCodes = [...snapshotByAuthority.keys()].filter(
    (authorityCode) => authorityCode !== "NATIONAL"
  )
  await mapWithConcurrency(authorityCodes, 4, async (authorityCode) => {
    const snapshot = snapshotByAuthority.get(authorityCode)
    if (!snapshot) throw new Error(`Missing ${authorityCode} planning dashboard snapshot`)
    const actual = await exactCountAndLatest(
      "planning_applications",
      "registration_date",
      authorityCode
    )
    assertSnapshotMatches(`${authorityCode} planning`, snapshot.payload, actual)
  })

  console.log(
    `Planning snapshots verified: ${nationalActual.count} applications through ${nationalActual.latestDate}; ` +
      `${authorityCodes.length} authority snapshots match.`
  )
}

async function verifyDublinDistrictSnapshots() {
  const { data, error } = await supabase
    .from("ppr_market_insights")
    .select("market_slug,total_sales_count,last_sale_date")
    .eq("range_key", "last-year")
    .in("market_slug", DUBLIN_DISTRICT_SLUGS)

  if (error) throw error

  const snapshotBySlug = new Map((data ?? []).map((row) => [row.market_slug, row]))
  const missing = DUBLIN_DISTRICT_SLUGS.filter((slug) => !snapshotBySlug.has(slug))
  if (missing.length > 0) {
    throw new Error(`Missing Dublin district PPR snapshots: ${missing.join(", ")}`)
  }

  const empty = DUBLIN_DISTRICT_SLUGS.filter(
    (slug) => Number(snapshotBySlug.get(slug)?.total_sales_count ?? 0) <= 0
  )
  if (empty.length > 0) {
    throw new Error(`Empty Dublin district PPR snapshots: ${empty.join(", ")}`)
  }

  console.log(`Dublin district snapshots verified: ${DUBLIN_DISTRICT_SLUGS.length} populated districts.`)
}

async function verifyPprSnapshots() {
  const [{ data: snapshot, error: snapshotError }, actual] = await Promise.all([
    supabase
      .from("ppr_national_snapshots")
      .select("sales_count,latest_sale_date,updated_at")
      .eq("range_key", "all")
      .maybeSingle(),
    exactCountAndLatest("ppr_sales", "date_of_sale"),
  ])
  if (snapshotError) throw snapshotError
  if (!snapshot) throw new Error("Missing all-time PPR national snapshot")

  assertSnapshotMatches("PPR national", snapshot, actual)
  await verifyDublinDistrictSnapshots()
  console.log(`PPR snapshot verified: ${actual.count} sales through ${actual.latestDate}.`)
}

if (dataset === "planning") await verifyPlanningSnapshots()
else await verifyPprSnapshots()
