import { createClient } from "@supabase/supabase-js"

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) throw new Error("Supabase service credentials are required")

const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
const end = new Date()
end.setUTCDate(end.getUTCDate() - 2)
const start = new Date(end)
start.setUTCDate(start.getUTCDate() - 27)
const startDate = start.toISOString().slice(0, 10)
const endDate = end.toISOString().slice(0, 10)

const { data: memberships, error: membershipError } = await supabase
  .from("locality_seo_memberships")
  .select("canonical_path,seo_tier")
  .eq("surface", "planning")
  .is("left_at", null)
if (membershipError) throw membershipError

const { data: performance, error: performanceError } = await supabase
  .from("locality_seo_search_performance")
  .select("canonical_path,clicks,impressions,position")
  .gte("data_date", startDate)
  .lte("data_date", endDate)
if (performanceError) throw performanceError

console.log("Planning locality SEO tiers")
console.log(`- Measurement window: ${startDate} to ${endDate}`)

for (const tier of ["priority", "expanded"]) {
  const paths = new Set((memberships || []).filter((row) => row.seo_tier === tier).map((row) => row.canonical_path))
  const rows = (performance || []).filter((row) => paths.has(row.canonical_path))
  const clicks = rows.reduce((sum, row) => sum + Number(row.clicks || 0), 0)
  const impressions = rows.reduce((sum, row) => sum + Number(row.impressions || 0), 0)
  const pagesWithImpressions = new Set(rows.filter((row) => Number(row.impressions || 0) > 0).map((row) => row.canonical_path)).size
  const pagesWithClicks = new Set(rows.filter((row) => Number(row.clicks || 0) > 0).map((row) => row.canonical_path)).size
  const weightedPosition = rows.reduce((sum, row) => sum + Number(row.position || 0) * Number(row.impressions || 0), 0)
  const ctr = impressions > 0 ? `${((clicks / impressions) * 100).toFixed(2)}%` : "n/a"
  const avgPosition = impressions > 0 ? (weightedPosition / impressions).toFixed(2) : "n/a"
  console.log(`- ${tier}: ${paths.size} URLs; ${pagesWithImpressions} with impressions; ${pagesWithClicks} with clicks; ${clicks} clicks; ${impressions} impressions; CTR ${ctr}; avg position ${avgPosition}; ${(impressions / Math.max(paths.size, 1)).toFixed(2)} impressions/page`)
}
