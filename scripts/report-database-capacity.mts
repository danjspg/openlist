import { createClient } from "@supabase/supabase-js"

const LIMIT_BYTES = 8 * 1024 * 1024 * 1024

const formatGiB = (bytes: number) => `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GiB`
const formatMiB = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(0)} MiB`
const formatSignedMiB = (bytes: number) => `${bytes >= 0 ? "+" : ""}${(bytes / 1024 / 1024).toFixed(0)} MiB`

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
  console.log(`| Database size | **${formatGiB(databaseBytes)}** |`)
  console.log(`| 8 GiB tier used | **${usedPct.toFixed(1)}%** |`)
  console.log(`| Remaining headroom | **${formatGiB(remainingBytes)}** |`)
  console.log(`| Change vs prior Sunday | ${previousBytes == null ? "Baseline snapshot" : formatSignedMiB(databaseBytes - previousBytes)} |`)
  console.log("")
  console.log("Largest tables:")
  console.log("")
  console.log("| Table | Size |")
  console.log("| --- | ---: |")
  for (const table of data.table_sizes ?? []) {
    console.log(`| \`${table.table_name}\` | ${formatMiB(Number(table.bytes))} |`)
  }
}

await main()
