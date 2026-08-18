import { createClient } from "@supabase/supabase-js"

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!supabaseUrl || !serviceRoleKey) {
  throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY")
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
})
const { data, error } = await supabase.rpc("openlist_planning_timeline_report")
if (error) throw error

const report = data || {}
const percentage = (value, total) =>
  Number(total) > 0 ? `${((Number(value) / Number(total)) * 100).toFixed(2)}%` : "n/a"

console.log("Planning timeline report")
console.log(`Captured: ${report.capturedAt}`)
console.log(`Applications: ${report.applications}`)
console.log(`At least 1 provable event: ${report.atLeastOne} (${percentage(report.atLeastOne, report.applications)})`)
console.log(`At least 2 provable events: ${report.atLeastTwo} (${percentage(report.atLeastTwo, report.applications)})`)
console.log(`At least 3 provable events: ${report.atLeastThree} (${percentage(report.atLeastThree, report.applications)})`)
console.log(`Stored events: ${report.eventsStored} (${report.reconstructedEvents} reconstructed, ${report.observedEvents} observed)`)
console.log(`Applications with unclassified source status: ${report.unknownStatuses}`)
