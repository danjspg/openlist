import { createClient } from "@supabase/supabase-js"

import { createPlanningAlertWatcher } from "../lib/planning-alert-watch.mjs"

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!supabaseUrl || !serviceRoleKey) {
  throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY")
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
})
const delayMs = Math.max(0, Number(process.env.PLANNING_ALERT_WATCH_DELAY_MS || 750))
const applicationId = process.argv.find((value) => value.startsWith("--application-id="))?.split("=")[1] || null

const watcher = createPlanningAlertWatcher({ supabase, delayMs })
console.log(JSON.stringify(await watcher.run(applicationId)))
