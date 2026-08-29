import { createClient } from "@supabase/supabase-js"

const LIMIT_BYTES = 8_000_000_000

const formatGB = (bytes: number) => `${(bytes / 1_000_000_000).toFixed(2)} GB`
const formatMB = (bytes: number) => `${(bytes / 1_000_000).toFixed(0)} MB`
const formatSignedMB = (bytes: number) => `${bytes >= 0 ? "+" : ""}${(bytes / 1_000_000).toFixed(0)} MB`

async function main() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY")
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const { data, error } = await supabase.rpc("capture_database_size_snapshot")
  if (error) throw error

  const databaseBytes = Number(data.database_bytes)
  const previousBytes = data.previous_database_bytes == null ? null : Number(data.previous_database_bytes)
  const usedPct = (databaseBytes / LIMIT_BYTES) * 100
  const remainingBytes = Math.max(0, LIMIT_BYTES - databaseBytes)

  console.log("## Database capacity")
  console.log("")
  console.log(`Snapshot: **${data.snapshot_date}**`)
  console.log("")
  console.log("| Metric | Current |")
  console.log("| --- | ---: |")
  console.log(`| Database size | **${formatGB(databaseBytes)}** |`)
  console.log(`| 8 GB tier used | **${usedPct.toFixed(1)}%** |`)
  console.log(`| Remaining headroom | **${formatGB(remainingBytes)}** |`)
  console.log(`| Change vs prior Sunday | ${previousBytes == null ? "Baseline snapshot" : formatSignedMB(databaseBytes - previousBytes)} |`)
  console.log("")
  console.log("Largest tables:")
  console.log("")
  console.log("| Table | Size |")
  console.log("| --- | ---: |")
  for (const table of data.table_sizes ?? []) {
    console.log(`| \`${table.table_name}\` | ${formatMB(Number(table.bytes))} |`)
  }
}

await main()
