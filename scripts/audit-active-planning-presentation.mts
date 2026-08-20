import { appendFile } from "node:fs/promises"

import { createClient } from "@supabase/supabase-js"

import {
  DAILY_ACTIVE_PLANNING_STATUSES,
  DECISION_MADE_FOLLOW_UP_DAYS,
  RECENT_UNKNOWN_FOLLOW_UP_DAYS,
  subtractUtcDays,
} from "../lib/active-planning-refresh"
import { proposalPresentationProblems } from "../lib/high-interest-planning-qa"

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!supabaseUrl || !serviceRoleKey) {
  throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY")
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
})

const pageSize = 1000

type Candidate = {
  id: string
  local_authority_code: string
  reference: string
  proposal: string | null
}

function todayUtc() {
  return new Date().toISOString().slice(0, 10)
}

async function fetchPaged(
  label: string,
  configure: (query: any) => any
): Promise<Candidate[]> {
  const rows: Candidate[] = []
  for (let offset = 0; ; offset += pageSize) {
    let query = supabase
      .from("planning_applications")
      .select("id,local_authority_code,reference,proposal")
      .order("id", { ascending: true })
      .range(offset, offset + pageSize - 1)
    query = configure(query)
    const { data, error } = await query
    if (error) throw new Error(`${label}: ${error.message}`)
    rows.push(...((data || []) as Candidate[]))
    if (!data || data.length < pageSize) break
  }
  return rows
}

async function loadCandidates(today: string) {
  const decisionCutoff = subtractUtcDays(today, DECISION_MADE_FOLLOW_UP_DAYS)
  const unknownCutoff = subtractUtcDays(today, RECENT_UNKNOWN_FOLLOW_UP_DAYS)

  const [active, recentDecisions, undatedDecisions, recentUnknown] = await Promise.all([
    fetchPaged("active presentation QA", (query) =>
      query.in("normalized_status", [...DAILY_ACTIVE_PLANNING_STATUSES])
    ),
    fetchPaged("recent-decision presentation QA", (query) =>
      query.eq("normalized_status", "decision_made").gte("decision_date", decisionCutoff)
    ),
    fetchPaged("undated-decision presentation QA", (query) =>
      query.eq("normalized_status", "decision_made").is("decision_date", null)
    ),
    fetchPaged("recent-unknown presentation QA", (query) =>
      query.eq("normalized_status", "unknown").gte("registration_date", unknownCutoff)
    ),
  ])

  const byId = new Map<string, Candidate>()
  for (const row of [...active, ...recentDecisions, ...undatedDecisions, ...recentUnknown]) {
    byId.set(row.id, row)
  }
  return [...byId.values()]
}

async function main() {
  const candidates = await loadCandidates(todayUtc())
  const problems: Array<Candidate & { problems: string[] }> = []

  for (const candidate of candidates) {
    const presentationProblems = proposalPresentationProblems(candidate.proposal)
    if (presentationProblems.length === 0) continue
    problems.push({ ...candidate, problems: presentationProblems })
    const message = `${candidate.local_authority_code} ${candidate.reference}: ${presentationProblems.join("; ")}`
    console.warn(message)
    if (process.env.GITHUB_ACTIONS === "true") {
      console.log(`::warning title=Planning title/description QA::${message}`)
    }
  }

  const summary = {
    checked: candidates.length,
    warnings: problems.length,
    problemCounts: problems.reduce<Record<string, number>>((counts, row) => {
      for (const problem of row.problems) counts[problem] = (counts[problem] || 0) + 1
      return counts
    }, {}),
  }

  console.log(`Active Planning title/description QA: ${summary.checked} checked, ${summary.warnings} with presentation warnings.`)
  console.log(JSON.stringify(summary, null, 2))

  if (process.env.GITHUB_STEP_SUMMARY) {
    const examples = problems.slice(0, 20)
    const lines = [
      "### Active Planning title/description QA",
      "",
      `Checked **${summary.checked}** active/follow-up applications after refresh; **${summary.warnings}** had presentation warnings.`,
    ]
    if (examples.length > 0) {
      lines.push("", "Examples:")
      for (const row of examples) {
        lines.push(`- \`${row.local_authority_code} ${row.reference}\`: ${row.problems.join("; ")}`)
      }
      if (problems.length > examples.length) {
        lines.push(`- …and ${problems.length - examples.length} more; see workflow logs.`)
      }
    }
    lines.push("")
    await appendFile(process.env.GITHUB_STEP_SUMMARY, `${lines.join("\n")}\n`)
  }
}

await main()
