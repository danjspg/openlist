import { createClient } from "@supabase/supabase-js"

const REQUEST_TIMEOUT_MS = 15000
const BASE_URLS = [
  "https://www.eplanning.ie/KildareCC/AppFileRefDetails",
  "https://eplanning.ie/KildareCC/AppFileRefDetails",
]

const compact = (value: unknown) => String(value ?? "").replace(/\s+/g, " ").trim()
const decode = (value: string) => value
  .replace(/&nbsp;/gi, " ")
  .replace(/&amp;/gi, "&")
  .replace(/&quot;/gi, '"')
  .replace(/&#39;|&apos;/gi, "'")
  .replace(/&lt;/gi, "<")
  .replace(/&gt;/gi, ">")
  .replace(/&#(\d+);/g, (_m, n) => String.fromCharCode(Number(n)))

export function htmlText(value: string) {
  return compact(decode(value.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")))
}

export function valueAfterLabel(html: string, labels: string[]) {
  for (const label of labels) {
    const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    const patterns = [
      new RegExp(`${escaped}\\s*:?\\s*<\\/[^>]+>\\s*<[^>]+>([\\s\\S]*?)<\\/[^>]+>`, "i"),
      new RegExp(`${escaped}\\s*:?([\\s\\S]{0,800}?)(?:<\\/tr>|<br\\s*\\/?>)`, "i"),
    ]
    for (const pattern of patterns) {
      const match = html.match(pattern)
      if (!match) continue
      const text = htmlText(match[1])
      if (text && !labels.some(candidate => text.toLowerCase() === candidate.toLowerCase())) return text
    }
  }
  return null
}

export function parseKildareEplan(html: string) {
  const text = htmlText(html)
  if (/select search type|find a planning application search/i.test(text) && !/development description/i.test(text)) return null
  const proposal = valueAfterLabel(html, ["Development Description", "Development Description:"])
  const decision = valueAfterLabel(html, ["Decision Type", "Decision Type:"])
  const applicationStatus = valueAfterLabel(html, ["Application Status", "Application Status:", "Status", "Status:"])
  const status = compact(decision || applicationStatus) || null
  if (!proposal && !status) return null
  return { proposal: compact(proposal) || null, status }
}

async function fetchHtml(url: string, label: string) {
  let last: Error | null = null
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 OpenList notable Planning quality audit",
          "Accept": "text/html,application/xhtml+xml",
        },
        redirect: "follow",
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      })
      if (response.ok) return await response.text()
      last = new Error(`${label}: HTTP ${response.status}`)
      if (![408, 425, 429, 500, 502, 503, 504].includes(response.status)) break
    } catch (error) {
      last = error instanceof Error ? error : new Error(String(error))
    }
    if (attempt < 3) await new Promise(resolve => setTimeout(resolve, attempt * 750))
  }
  throw last || new Error(`${label} failed`)
}

async function fetchSource(reference: string) {
  for (const base of BASE_URLS) {
    try {
      const html = await fetchHtml(`${base}/${encodeURIComponent(reference)}/0`, `Kildare ePlan ${reference}`)
      const parsed = parseKildareEplan(html)
      if (parsed) return { ...parsed, source: "kildare_eplan" }
    } catch (error) {
      console.warn(error instanceof Error ? error.message : String(error))
    }
  }
  return null
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error("Missing Supabase credentials")
  const apply = process.argv.includes("--apply")
  if (apply && process.env.CONFIRM_NOTABLE_QUALITY_REPAIR !== "true") throw new Error("Production repair requires confirmation")
  const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })

  const { data: notable, error: notableError } = await supabase.from("planning_seo_notable")
    .select("application_id").eq("active", true).eq("priority_eligible", true).is("description_checked_at", null)
  if (notableError) throw notableError
  const ids = (notable || []).map(row => row.application_id)
  if (ids.length === 0) {
    console.log(JSON.stringify({ total: 0, checked: 0, repairedProposals: 0, repairedStatuses: 0, unresolved: 0 }))
    return
  }
  const rows: Record<string, unknown>[] = []
  for (let offset = 0; offset < ids.length; offset += 200) {
    const { data, error } = await supabase.from("planning_applications").select("id,local_authority_code,reference,proposal,status,status_source,appeal_decision_source,appeal_decision_date").in("id", ids.slice(offset, offset + 200)).eq("local_authority_code", "KILDARE")
    if (error) throw error
    rows.push(...(data || []))
  }

  let checked = 0
  let repairedProposals = 0
  let repairedStatuses = 0
  const unresolved: string[] = []
  for (const row of rows) {
    const reference = compact(row.reference)
    const source = await fetchSource(reference)
    if (!source) {
      unresolved.push(reference)
      continue
    }
    const currentProposal = compact(row.proposal)
    const currentStatus = compact(row.status)
    const changes: Record<string, unknown> = { last_source_checked_at: new Date().toISOString() }
    if (source.proposal && source.proposal.length > currentProposal.length + 10) {
      changes.proposal = source.proposal
      repairedProposals += 1
    }
    const precedence = compact(row.status_source).toLowerCase().includes("acp") || Boolean(row.appeal_decision_source) || Boolean(row.appeal_decision_date)
    if (source.status && source.status.toLowerCase() !== currentStatus.toLowerCase() && !precedence) {
      changes.status = source.status
      changes.status_source = "eplan"
      changes.status_observed_at = new Date().toISOString()
      repairedStatuses += 1
    }
    if (apply) {
      const { error } = await supabase.from("planning_applications").update(changes).eq("id", row.id)
      if (error) throw error
      const now = new Date().toISOString()
      const { error: checkedError } = await supabase.from("planning_seo_notable").update({ description_checked_at: now, updated_at: now }).eq("application_id", row.id)
      if (checkedError) throw checkedError
      if ("proposal" in changes || "status" in changes) {
        const { error: queueError } = await supabase.from("planning_revalidation_queue").upsert({ application_id: row.id, requested_at: now }, { onConflict: "application_id" })
        if (queueError) throw queueError
      }
    }
    checked += 1
    await new Promise(resolve => setTimeout(resolve, 150))
  }
  console.log(JSON.stringify({ total: rows.length, checked, repairedProposals, repairedStatuses, unresolved: unresolved.length, unresolvedReferences: unresolved }, null, 2))
}

await main()
