import { createClient } from "@supabase/supabase-js"
import { readFile } from "node:fs/promises"

const formatCount = (value: number) => value.toLocaleString("en-GB")
const now = new Date()
const since24h = new Date(now.getTime() - 24 * 60 * 60 * 1000)
const since7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)

const argValue = (name: string) => {
  const index = process.argv.indexOf(name)
  return index >= 0 ? process.argv[index + 1] : undefined
}

const firstMatch = (text: string, pattern: RegExp, fallback = "n/a") =>
  text.match(pattern)?.[1]?.trim() || fallback

const section = (text: string, start: string, end?: string) => {
  const startIndex = text.indexOf(start)
  if (startIndex < 0) return ""
  const endIndex = end ? text.indexOf(end, startIndex + start.length) : -1
  return text.slice(startIndex, endIndex >= 0 ? endIndex : undefined)
}

async function countAlerts(
  supabase: ReturnType<typeof createClient>,
  options: { enabled?: boolean; since?: Date } = {}
) {
  let query = supabase
    .from("planning_alert_subscriptions")
    .select("id", { count: "exact", head: true })
  if (options.enabled !== undefined) query = query.eq("enabled", options.enabled)
  if (options.since) query = query.gte("created_at", options.since.toISOString())
  const { count, error } = await query
  if (error) throw error
  return count || 0
}

async function loadUsers(supabase: ReturnType<typeof createClient>) {
  const users: Array<{ created_at?: string }> = []
  const perPage = 1000
  for (let page = 1; ; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage })
    if (error) throw error
    users.push(...data.users)
    if (data.users.length < perPage) break
  }
  return users
}

const countCreatedSince = (rows: Array<{ created_at?: string }>, since: Date) =>
  rows.filter((row) => row.created_at && new Date(row.created_at) >= since).length

async function main() {
  const reportPath = argValue("--report")
  if (!reportPath) throw new Error("Usage: report-openlist-dashboard.mts --report <report file>")

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY")
  }

  const raw = await readFile(reportPath, "utf8")
  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const [users, alertsTotal, alertsEnabled, alerts24h, alerts7d] = await Promise.all([
    loadUsers(supabase),
    countAlerts(supabase),
    countAlerts(supabase, { enabled: true }),
    countAlerts(supabase, { since: since24h }),
    countAlerts(supabase, { since: since7d }),
  ])

  const users24h = countCreatedSince(users, since24h)
  const users7d = countCreatedSince(users, since7d)

  const planningSearch = section(raw, "Planning search performance trends:", "Sold Prices search performance trends:")
  const soldSearch = section(raw, "Sold Prices search performance trends:", "Top Sold Prices pages")
  const analytics = section(raw, "Vercel Web Analytics")
  const qa = section(raw, "High-interest Planning QA:", "Search Console sitemap")

  const planningLatest = firstMatch(planningSearch, /Latest Search Console data date: ([^\n]+)/)
  const planning7 = firstMatch(planningSearch, /Last 7 days \([^)]*\): ([^\n]+)/)
  const planning28 = firstMatch(planningSearch, /Last 28 days \([^)]*\): ([^\n]+)/)
  const planning7Change = firstMatch(planningSearch, /7-day change: ([^\n]+)/)
  const sold7 = firstMatch(soldSearch, /Last 7 days \([^)]*\): ([^\n]+)/)
  const sold28 = firstMatch(soldSearch, /Last 28 days \([^)]*\): ([^\n]+)/)
  const sold7Change = firstMatch(soldSearch, /7-day change: ([^\n]+)/)

  const planningRecords = firstMatch(raw, /Planning records: ([^\n]+)/)
  const sitemaps = firstMatch(raw, /Sitemaps: ([^\n]+)/)
  const inspection = firstMatch(raw, /Latest inspection sample: ([^\n]+)/)
  const notInspected = firstMatch(raw, /Membership URLs not yet inspected: ([^\n]+)/)
  const medianIndexDays = firstMatch(raw, /Median observed days from first sitemap observation to first indexed inspection: ([^\n]+)/)

  const visitors24 = firstMatch(analytics, /Last 24 hours: ([^\n]+)/)
  const visitors7 = firstMatch(analytics, /Last 7 days: ([^\n]+)/)
  const visitors28 = firstMatch(analytics, /Last 28 days: ([^\n]+)/)
  const planningTraffic28 = firstMatch(analytics, /Planning, last 28 days: ([^\n]+)/)
  const soldTraffic28 = firstMatch(analytics, /Sold Prices, last 28 days: ([^\n]+)/)

  const qaChecked = firstMatch(qa, /Checked: ([^\n]+)/)
  const qaPass = firstMatch(qa, /Pass: ([^\n]+)/)
  const qaRepaired = firstMatch(qa, /Repaired: ([^\n]+)/)
  const qaWarn = firstMatch(qa, /Warn: ([^\n]+)/)
  const qaFailures = firstMatch(qa, /Unresolved failures: ([^\n]+)/)

  console.log("# OpenList Growth & Search Dashboard")
  console.log("")
  console.log(`Updated: ${now.toISOString().replace("T", " ").replace(/\.\d{3}Z$/, " UTC")}`)
  console.log("")
  console.log("## Product growth")
  console.log("")
  console.log("| Metric | Total | Last 24h | Last 7d |")
  console.log("| --- | ---: | ---: | ---: |")
  console.log(`| Registered users | **${formatCount(users.length)}** | +${formatCount(users24h)} | +${formatCount(users7d)} |`)
  console.log(`| Planning alerts set | **${formatCount(alertsTotal)}** | +${formatCount(alerts24h)} | +${formatCount(alerts7d)} |`)
  console.log(`| Active planning alerts | **${formatCount(alertsEnabled)}** |  |  |`)
  console.log("")
  console.log("## Traffic")
  console.log("")
  console.log("| Window | Visitors / pageviews |")
  console.log("| --- | --- |")
  console.log(`| Last 24 hours | ${visitors24} |`)
  console.log(`| Last 7 days | ${visitors7} |`)
  console.log(`| Last 28 days | ${visitors28} |`)
  console.log(`| Planning, 28 days | ${planningTraffic28} |`)
  console.log(`| Sold Prices, 28 days | ${soldTraffic28} |`)
  console.log("")
  console.log("## Google Search")
  console.log("")
  console.log(`Search Console data through **${planningLatest}**.`)
  console.log("")
  console.log("| Area | Last 7 days | 7-day change | Last 28 days |")
  console.log("| --- | --- | --- | --- |")
  console.log(`| Planning | ${planning7} | ${planning7Change} | ${planning28} |`)
  console.log(`| Sold Prices | ${sold7} | ${sold7Change} | ${sold28} |`)
  console.log("")
  console.log("## Indexing")
  console.log("")
  console.log("| Metric | Current |")
  console.log("| --- | --- |")
  console.log(`| Planning records | ${planningRecords} |`)
  console.log(`| Sitemap cohort | ${sitemaps} |`)
  console.log(`| Latest inspection sample | ${inspection} |`)
  console.log(`| Membership URLs not yet inspected | ${notInspected} |`)
  console.log(`| Median observed time to indexing | ${medianIndexDays} days |`)
  console.log("")
  console.log("## High-interest planning QA")
  console.log("")
  console.log("| Checked | Pass | Repaired | Warnings | Unresolved failures |")
  console.log("| ---: | ---: | ---: | ---: | ---: |")
  console.log(`| ${qaChecked} | ${qaPass} | ${qaRepaired} | ${qaWarn} | **${qaFailures}** |`)
  console.log("")
  console.log("<details>")
  console.log("<summary>Full technical report</summary>")
  console.log("")
  console.log("```text")
  process.stdout.write(raw.trimEnd())
  console.log("\n```")
  console.log("")
  console.log("</details>")
}

await main()
