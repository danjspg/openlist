import { createClient } from "@supabase/supabase-js"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } }
)

const { data, error } = await supabase.rpc("openlist_refresh_planning_dashboard_snapshots")
if (error) throw new Error(`Planning dashboard snapshot refresh failed: ${error.message}`)
console.log("Planning dashboard snapshots refreshed", data)
