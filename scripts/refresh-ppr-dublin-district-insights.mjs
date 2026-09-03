import { createClient } from "@supabase/supabase-js"

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !serviceRoleKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY")
  process.exit(1)
}

const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } })
const districts = [
  "dublin-1","dublin-2","dublin-3","dublin-4","dublin-5","dublin-6","dublin-6w",
  "dublin-7","dublin-8","dublin-9","dublin-10","dublin-11","dublin-12","dublin-13",
  "dublin-14","dublin-15","dublin-16","dublin-18","dublin-22","dublin-24",
]

let refreshed = 0
for (const marketSlug of districts) {
  const { error } = await supabase.rpc("openlist_refresh_ppr_dublin_district_insight", { p_market_slug: marketSlug })
  if (error) {
    console.error(`Dublin district PPR insight refresh failed for ${marketSlug}:`, error)
    process.exit(1)
  }
  refreshed += 1
  console.log(`Refreshed Dublin district PPR insight ${refreshed}/${districts.length}: ${marketSlug}`)
}

console.log(`Dublin district PPR insights refreshed in ${refreshed} bounded transactions.`)
