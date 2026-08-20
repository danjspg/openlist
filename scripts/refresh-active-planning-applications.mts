import { spawn } from "node:child_process"
import path from "node:path"
import { fileURLToPath } from "node:url"

import { createClient } from "@supabase/supabase-js"

import {
  buildActivePlanningRefreshRanges,
  DAILY_ACTIVE_PLANNING_STATUSES,
  DECISION_MADE_FOLLOW_UP_DAYS,
  RECENT_UNKNOWN_FOLLOW_UP_DAYS,
  subtractUtcDays,
  type ActivePlanningRefreshCandidate,
} from "../lib/active-planning-refresh"

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!supabaseUrl || !serviceRoleKey) {
  throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY")
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
})
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const pageSize = 1000
const corkAuthorityCode = "CORKCOCO"
const rangeDelayMs = Math.max(
  0,
  Number(process.env.PLANNING_ACTIVE_REFRESH_RANGE_DELAY_MS || 500)
)
const dryRun = process.argv.includes("--dry-run")

function todayUtc() {
  return new Date().toISOString().slice(0, 10)
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

type CandidateRow = ActivePlanningRefreshCandidate & {
  decision_date: string | null
}

async function fetchPagedCandidates(
  label: string,
  configure: (query: any) => any
): Promise<CandidateRow[]> {
  const rows: CandidateRow[] = []
  for (let offset = 0; ; offset += pageSize) {
    let query = supabase
      .from("planning_applications")
      .select("id,local_authority_code,registration_date,normalized_status,decision_date")
      .not("registration_date", "is", null)
      .order("id", { ascending: true })
      .range(offset, offset + pageSize - 1)
    query = configure(query)
    const { data, error } = await query
    if (error) throw new Error(`${label}: ${error.message}`)
    rows.push(...((data || []) as CandidateRow[]))
    if (!data || data.length < pageSize) break
  }
  return rows
}

async function countMissingRegistrationDates() {
  const statuses = [...DAILY_ACTIVE_PLANNING_STATUSES, "decision_made"]
  const { count, error } = await supabase
    .from("planning_applications")
    .select("id", { count: "exact", head: true })
    .in("normalized_status", statuses)
    .is("registration_date", null)
  if (error) throw error
  return count || 0
}

async function loadCandidates(today: string) {
  const decisionCutoff = subtractUtcDays(today, DECISION_MADE_FOLLOW_UP_DAYS)
  const unknownCutoff = subtractUtcDays(today, RECENT_UNKNOWN_FOLLOW_UP_DAYS)

  const [active, recentDecisions, undatedDecisions, recentUnknown] = await Promise.all([
    fetchPagedCandidates("active statuses", (query) =>
      query.in("normalized_status", [...DAILY_ACTIVE_PLANNING_STATUSES])
    ),
    fetchPagedCandidates("recent decisions", (query) =>
      query.eq("normalized_status", "decision_made").gte("decision_date", decisionCutoff)
    ),
    fetchPagedCandidates("undated decisions", (query) =>
      query.eq("normalized_status", "decision_made").is("decision_date", null)
    ),
    fetchPagedCandidates("recent unknown statuses", (query) =>
      query.eq("normalized_status", "unknown").gte("registration_date", unknownCutoff)
    ),
  ])

  const byId = new Map<string, CandidateRow>()
  for (const row of [...active, ...recentDecisions, ...undatedDecisions, ...recentUnknown]) {
    byId.set(row.id, row)
  }

  return {
    candidates: Array.from(byId.values()),
    activeCount: active.length,
    recentDecisionCount: recentDecisions.length + undatedDecisions.length,
    recentUnknownCount: recentUnknown.length,
    decisionCutoff,
    unknownCutoff,
  }
}

async function runChild(args: string[]) {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(process.execPath, args, {
      cwd: repoRoot,
      env: process.env,
      stdio: "inherit",
    })
    child.on("error", reject)
    child.on("exit", (code) => {
      if (code === 0) resolve()
      else reject(new Error(`${args.join(" ")} exited with code ${code}`))
    })
  })
}

async function refreshRange(
  localAuthorityCode: string,
  from: string,
  to: string
) {
  if (localAuthorityCode === corkAuthorityCode) {
    const args = [
      "scripts/ingest-cork-planning-applications.mjs",
      from,
      to,
      "--window-days",
      "7",
    ]
    if (dryRun) args.push("--dry-run")
    await runChild(args)
    return
  }

  const args = [
    "scripts/ingest-national-planning-applications.mjs",
    "--from",
    from,
    "--to",
    to,
    "--authority",
    localAuthorityCode,
  ]
  if (dryRun) args.push("--dry-run")
  await runChild(args)
}

async function main() {
  const today = todayUtc()
  const cohort = await loadCandidates(today)
  const missingRegistrationDates = await countMissingRegistrationDates()
  const ranges = buildActivePlanningRefreshRanges(cohort.candidates, today)

  console.log(
    `Daily active Planning refresh ${dryRun ? "dry run" : "run"}: ${cohort.candidates.length} unique candidates across ${ranges.length} authority/date ranges.`
  )
  console.log(
    `Cohort composition: ${cohort.activeCount} live-status rows; ${cohort.recentDecisionCount} decision-made follow-up rows since ${cohort.decisionCutoff}; ${cohort.recentUnknownCount} recent unclassified rows since ${cohort.unknownCutoff}.`
  )
  if (missingRegistrationDates > 0) {
    console.warn(
      `${missingRegistrationDates} active/follow-up rows have no registration date and cannot be targeted by the source date-range refresh.`
    )
  }

  for (const [index, range] of ranges.entries()) {
    console.log(
      `[${index + 1}/${ranges.length}] ${range.localAuthorityCode} ${range.from} to ${range.to}: ${range.candidateCount} tracked candidates across ${range.monthCount} active month(s).`
    )
    await refreshRange(range.localAuthorityCode, range.from, range.to)
    if (rangeDelayMs > 0 && index < ranges.length - 1) await sleep(rangeDelayMs)
  }

  console.log(
    `Daily active Planning refresh completed: ${cohort.candidates.length} candidates represented by ${ranges.length} source refresh ranges.`
  )
}

await main()
