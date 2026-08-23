import { createClient } from "@supabase/supabase-js"

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !serviceRoleKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY")
  process.exit(1)
}

const supabase = createClient(supabaseUrl, serviceRoleKey)

const { error } = await supabase.rpc("openlist_refresh_ppr_dublin_district_insights")

if (error) {
  console.error("Dublin district PPR insights refresh failed:", error)
  process.exit(1)
}

console.log("Dublin district PPR insights refreshed.")
