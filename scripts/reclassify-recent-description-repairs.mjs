import { createClient } from "@supabase/supabase-js"
import { classifyAndPersistPlanningApplications } from "../lib/planning-notable-persistence.mjs"

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) throw new Error("Missing Supabase credentials")

const hoursArg = process.argv.find((arg) => arg.startsWith("--hours="))
const hours = Math.max(1, Math.min(24, Number(hoursArg?.split("=")[1] || 2)))
const limitArg = process.argv.find((arg) => arg.startsWith("--limit="))
const limit = Math.max(1, Math.min(5000, Number(limitArg?.split("=")[1] || 2500)))
const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString()

const rows = []
for (let offset = 0; offset < limit; offset += 500) {
  const { data, error } = await supabase
    .from("planning_applications")
    .select("*")
    .gte("last_source_checked_at", since)
    .gt("updated_at", since)
    .order("updated_at", { ascending: true })
    .range(offset, Math.min(limit - 1, offset + 499))
  if (error) throw error
  rows.push(...(data || []))
  if (!data || data.length < 500) break
}

let scanned = 0
let notable = 0
let changed = 0
let created = 0
let updated = 0
const newNotables = []

for (let offset = 0; offset < rows.length; offset += 100) {
  const batch = rows.slice(offset, offset + 100)
  const result = await classifyAndPersistPlanningApplications(supabase, batch, {
    dryRun: false,
    enqueue: true,
  })
  scanned += result.scanned
  notable += result.notable
  changed += result.changed
  created += result.created
  updated += result.updated
  for (const item of result.results || []) {
    if (item.classification?.notable && !item.existing) {
      newNotables.push({
        id: item.application?.id,
        authority: item.application?.local_authority_code,
        reference: item.application?.reference,
        categories: item.classification?.categories || [],
        residentialUnits: item.classification?.signals?.residentialUnits || 0,
      })
    }
  }
}

console.log(JSON.stringify({
  generatedAt: new Date().toISOString(),
  since,
  candidateRows: rows.length,
  scanned,
  notable,
  changed,
  created,
  updated,
  newNotables,
}, null, 2))
