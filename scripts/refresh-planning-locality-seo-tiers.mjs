import { createClient } from "@supabase/supabase-js"

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) throw new Error("Supabase service credentials are required")

const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
const target = Number(process.env.PLANNING_LOCALITY_PRIORITY_TARGET || 500)
const { data, error } = await supabase.rpc("openlist_refresh_planning_locality_seo_tiers", { p_priority_target: target })
if (error) throw error
console.log(JSON.stringify({ generatedAt: new Date().toISOString(), target, ...data }, null, 2))
