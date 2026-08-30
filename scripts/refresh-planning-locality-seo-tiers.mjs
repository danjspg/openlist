import { createClient } from "@supabase/supabase-js"

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) throw new Error("Supabase service credentials are required")

const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
const target = Number(process.env.PLANNING_LOCALITY_PRIORITY_TARGET || 500)

const authorityCodes = new Set()
for (let offset = 0; ; offset += 1000) {
  const { data: authorityRows, error: authorityError } = await supabase
    .from("locality_seo_memberships")
    .select("authority_code,id")
    .eq("surface", "planning")
    .is("left_at", null)
    .not("authority_code", "is", null)
    .order("authority_code")
    .order("id")
    .range(offset, offset + 999)

  if (authorityError) throw authorityError
  for (const row of authorityRows || []) {
    if (row.authority_code) authorityCodes.add(row.authority_code)
  }
  if ((authorityRows || []).length < 1000) break
}

const authorities = [...authorityCodes].sort()
const activity = []
for (const authorityCode of authorities) {
  const { data, error } = await supabase.rpc("openlist_refresh_planning_locality_activity_counts", {
    p_authority_code: authorityCode,
  })
  if (error) throw error
  activity.push(data)
}

const { data, error } = await supabase.rpc("openlist_refresh_planning_locality_seo_tiers", { p_priority_target: target })
if (error) throw error
console.log(JSON.stringify({ generatedAt: new Date().toISOString(), target, authorities: activity, ...data }, null, 2))
