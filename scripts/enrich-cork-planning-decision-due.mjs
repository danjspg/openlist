import { createClient } from "@supabase/supabase-js"
import {
  isTerminalPlanningStatus,
  normalisePlanningStatus,
} from "../lib/planning-status.mjs"
import { parseCorkCouncilDate } from "../lib/cork-planning-source.mjs"

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!supabaseUrl || !serviceRoleKey) {
  throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY")
}

const AUTHORITY_CODE = "CORKCOCO"
const API_DETAIL_URL = "https://planningapi.agileapplications.ie/api/application"
const DEFAULT_LIMIT = 10
const MAX_LIMIT = 50
const REQUEST_DELAY_MS = Number(process.env.PLANNING_API_REQUEST_DELAY_MS || 1000)
const RETRYABLE_HTTP_STATUSES = new Set([408, 425, 429, 500, 502, 503, 504])
const ACTIVE_STATUSES = new Set([
  "pre_validation",
  "registered",
  "under_assessment",
  "further_information_requested",
  "further_information_received",
])
const HEADERS = {
  "User-Agent": "OpenList bounded Cork decision-due enrichment",
  "x-client": AUTHORITY_CODE,
  "x-product": "CITIZENPORTAL",
  "x-service": "PA",
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const args = process.argv.slice(2)
const apply = args.includes("--apply")

function readArg(name) {
  const index = args.indexOf(name)
  return index >= 0 ? args[index + 1] || null : null
}

const reference = readArg("--reference")
const beforeReference = readArg("--before-reference")
const requestedLimit = Number(readArg("--limit") || DEFAULT_LIMIT)
if (!Number.isInteger(requestedLimit) || requestedLimit < 1 || requestedLimit > MAX_LIMIT) {
  throw new Error(`--limit must be an integer between 1 and ${MAX_LIMIT}`)
}
if (reference && beforeReference) throw new Error("Use either --reference or --before-reference, not both")

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
})

function isActiveCandidate(row) {
  const status = normalisePlanningStatus(row.normalized_status || row.status)
  return ACTIVE_STATUSES.has(status) &&
    !isTerminalPlanningStatus(status) &&
    !row.decision_date &&
    !row.final_grant_date &&
    !row.appeal_decision_date &&
    !row.withdrawal_date
}

async function selectCandidates() {
  const fields = [
    "id",
    "reference",
    "source_application_id",
    "status",
    "normalized_status",
    "decision_due_date",
    "decision_date",
    "final_grant_date",
    "appeal_decision_date",
    "withdrawal_date",
  ].join(",")
  let query = supabase
    .from("planning_applications")
    .select(fields)
    .eq("local_authority_code", AUTHORITY_CODE)
    .in("normalized_status", [...ACTIVE_STATUSES])
    .not("source_application_id", "is", null)
    .is("decision_date", null)
    .is("final_grant_date", null)
    .is("appeal_decision_date", null)
    .is("withdrawal_date", null)
    .order("reference", { ascending: false })
    .limit(reference ? 1 : requestedLimit)

  if (reference) query = query.eq("reference", reference)
  else {
    query = query.is("decision_due_date", null)
    if (beforeReference) query = query.lt("reference", beforeReference)
  }

  const { data, error } = await query
  if (error) throw error
  return (data || []).filter(isActiveCandidate)
}

function isNetworkFailure(error) {
  const code = error?.cause?.code || error?.code
  return ["ENOTFOUND", "EAI_AGAIN", "ECONNREFUSED", "ECONNRESET", "ETIMEDOUT"].includes(code) ||
    /fetch failed|network|dns|resolve|connection/i.test(String(error?.message || ""))
}

function retryAfterMs(response) {
  const value = response.headers.get("retry-after")
  if (!value) return null
  const seconds = Number(value)
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000)
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : Math.max(0, date.getTime() - Date.now())
}

async function fetchDetail(candidate) {
  await sleep(REQUEST_DELAY_MS)
  for (let attempt = 1; attempt <= 6; attempt += 1) {
    let response
    try {
      response = await fetch(`${API_DETAIL_URL}/${candidate.source_application_id}`, {
        headers: HEADERS,
      })
    } catch (error) {
      if (isNetworkFailure(error)) throw error
      if (attempt === 6) throw error
      await sleep(1000 * 2 ** (attempt - 1))
      continue
    }
    if (response.ok) return response.json()
    if (!RETRYABLE_HTTP_STATUSES.has(response.status) || attempt === 6) {
      throw new Error(`Cork detail ${candidate.reference}: HTTP ${response.status}`)
    }
    await sleep(retryAfterMs(response) ?? 1000 * 2 ** (attempt - 1))
  }
}

async function updateCandidate(candidate, dueDate) {
  const { data, error } = await supabase
    .from("planning_applications")
    .update({
      decision_due_date: dueDate,
      updated_at: new Date().toISOString(),
      revalidation_pending: true,
    })
    .eq("id", candidate.id)
    .eq("reference", candidate.reference)
    .eq("local_authority_code", AUTHORITY_CODE)
    .is("decision_due_date", null)
    .select("id")
  if (error) throw error
  return (data || []).length > 0
}

async function main() {
  const candidates = await selectCandidates()
  const report = {
    selected: candidates.length,
    detailFetched: 0,
    dueDatesFound: 0,
    dueDatesAbsent: 0,
    invalidDueDates: 0,
    updated: 0,
    skippedConcurrent: 0,
    failed: 0,
    nextCursor: candidates.at(-1)?.reference || null,
  }
  const results = []

  for (const candidate of candidates) {
    try {
      const detail = await fetchDetail(candidate)
      report.detailFetched += 1
      const parsed = parseCorkCouncilDate(detail.decisionDueDate)
      if (parsed) {
        report.dueDatesFound += 1
        results.push({ candidate, dueDate: parsed })
      } else if (detail.decisionDueDate === null || detail.decisionDueDate === undefined) {
        report.dueDatesAbsent += 1
        results.push({ candidate, dueDate: null })
      } else {
        report.invalidDueDates += 1
      }
      console.log(JSON.stringify({ reference: candidate.reference, decisionDueDate: parsed }))
    } catch (error) {
      if (isNetworkFailure(error)) throw error
      report.failed += 1
      console.error(`${candidate.reference}: ${error.message}`)
    }
  }

  if (apply) {
    for (const result of results.filter((entry) => entry.dueDate)) {
      if (await updateCandidate(result.candidate, result.dueDate)) report.updated += 1
      else report.skippedConcurrent += 1
    }
  }

  console.log(JSON.stringify({ mode: apply ? "apply" : "dry-run", ...report }, null, 2))
}

main().catch((error) => {
  console.error(`Cork decision-due enrichment stopped: ${error.message}`)
  process.exitCode = 1
})
