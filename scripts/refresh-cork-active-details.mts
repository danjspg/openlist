import { createClient } from "@supabase/supabase-js"

import { parseCorkCouncilDate } from "../lib/cork-planning-source.mjs"
import {
  CORK_AGILE_AUTHORITIES,
  corkAgileApplicationConfig,
  corkAgileSourceApplicationId,
} from "../lib/cork-agile-authorities.mjs"

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!supabaseUrl || !serviceRoleKey) {
  throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY")
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
})

const AUTHORITY_CODES = [...CORK_AGILE_AUTHORITIES.keys()]
const DETAIL_URL = "https://planningapi.agileapplications.ie/api/application"
const ACTIVE_STATUSES = [
  "pre_validation",
  "registered",
  "under_assessment",
  "further_information_requested",
  "further_information_received",
]
const REQUEST_DELAY_MS = Math.max(
  0,
  Number(process.env.PLANNING_API_REQUEST_DELAY_MS || 1000)
)
const RETRYABLE = new Set([408, 425, 429, 500, 502, 503, 504])
const PAGE_SIZE = 500
const dryRun = process.argv.includes("--dry-run")

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

type Candidate = {
  id: string
  local_authority_code: string
  reference: string
  source_application_id: number
  source_url: string | null
  registration_date: string | null
  proposal: string | null
  decision_due_date: string | null
}

async function loadCandidates() {
  const rows: Candidate[] = []
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data, error } = await supabase
      .from("planning_applications")
      .select("id,local_authority_code,reference,source_application_id,source_url,registration_date,proposal,decision_due_date")
      .in("local_authority_code", AUTHORITY_CODES)
      .in("normalized_status", ACTIVE_STATUSES)
      .not("source_application_id", "is", null)
      .is("decision_date", null)
      .is("final_grant_date", null)
      .is("appeal_decision_date", null)
      .is("withdrawal_date", null)
      .order("id", { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1)
    if (error) throw error
    rows.push(
      ...((data || []) as Candidate[]).filter((candidate) =>
        Boolean(corkAgileApplicationConfig(candidate))
      )
    )
    if (!data || data.length < PAGE_SIZE) break
  }
  return rows
}

function isNetworkFailure(error: unknown) {
  const value = error as { code?: string; cause?: { code?: string }; message?: string }
  const code = value?.cause?.code || value?.code
  return (
    ["ENOTFOUND", "EAI_AGAIN", "ECONNREFUSED", "ECONNRESET", "ETIMEDOUT"].includes(code || "") ||
    /fetch failed|network|dns|resolve|connection/i.test(String(value?.message || ""))
  )
}

async function fetchDetail(candidate: Candidate) {
  const config = corkAgileApplicationConfig(candidate)
  if (!config) return null
  const sourceApplicationId = corkAgileSourceApplicationId(config, candidate)
  if (!sourceApplicationId) return null
  if (REQUEST_DELAY_MS > 0) await sleep(REQUEST_DELAY_MS)
  let lastError: Error | null = null

  for (let attempt = 1; attempt <= 5; attempt += 1) {
    try {
      const response = await fetch(`${DETAIL_URL}/${sourceApplicationId}`, {
        headers: {
          "User-Agent": "OpenList active Cork planning detail refresh",
          "x-client": config.code,
          "x-product": "CITIZENPORTAL",
          "x-service": "PA",
        },
      })
      if (response.ok) return await response.json()
      if (response.status === 404) return null
      lastError = new Error(`${candidate.reference}: HTTP ${response.status}`)
      if (!RETRYABLE.has(response.status)) break
    } catch (error) {
      if (isNetworkFailure(error)) throw error
      lastError = error instanceof Error ? error : new Error(String(error))
    }
    await sleep(attempt * 1000)
  }

  throw lastError || new Error(`${candidate.reference}: detail request failed`)
}

function fullerProposal(currentValue: string | null, sourceValue: unknown) {
  const current = String(currentValue || "").trim().replace(/\s+/g, " ")
  const source = String(sourceValue || "").trim().replace(/\s+/g, " ")
  if (!source || source === current) return null
  if (!current) return source
  return source.length > current.length && source.startsWith(current) ? source : null
}

async function main() {
  const candidates = await loadCandidates()
  let checked = 0
  let changed = 0
  let dueDateChanges = 0
  let proposalChanges = 0
  let warnings = 0

  console.log(
    `Active Cork detail ${dryRun ? "dry run" : "refresh"}: ${candidates.length} candidates.`
  )

  for (const candidate of candidates) {
    let detail: any
    try {
      detail = await fetchDetail(candidate)
    } catch (error) {
      if (isNetworkFailure(error)) throw error
      warnings += 1
      console.warn(`${candidate.reference}: ${error instanceof Error ? error.message : String(error)}`)
      continue
    }
    checked += 1
    if (!detail) {
      warnings += 1
      console.warn(`${candidate.reference}: authoritative detail endpoint returned 404`)
      continue
    }

    const updates: Record<string, string | boolean> = {}
    if (Object.hasOwn(detail, "decisionDueDate") && detail.decisionDueDate !== null) {
      const dueDate = parseCorkCouncilDate(detail.decisionDueDate)
      if (dueDate && dueDate !== candidate.decision_due_date) {
        updates.decision_due_date = dueDate
        dueDateChanges += 1
      } else if (!dueDate && detail.decisionDueDate !== undefined) {
        warnings += 1
        console.warn(`${candidate.reference}: invalid decisionDueDate from authoritative detail source`)
      }
    }

    const proposal = fullerProposal(candidate.proposal, detail.fullProposal)
    if (proposal) {
      updates.proposal = proposal
      proposalChanges += 1
    }

    if (Object.keys(updates).length === 0) continue
    changed += 1
    if (dryRun) {
      console.log(`${candidate.reference}: would update ${Object.keys(updates).join(", ")}`)
      continue
    }

    const { error } = await supabase
      .from("planning_applications")
      .update({
        ...updates,
        updated_at: new Date().toISOString(),
        revalidation_pending: true,
      })
      .eq("id", candidate.id)
      .eq("local_authority_code", candidate.local_authority_code)
      .eq("reference", candidate.reference)
    if (error) throw error
    console.log(`${candidate.reference}: updated ${Object.keys(updates).join(", ")}`)
  }

  console.log(
    JSON.stringify(
      {
        mode: dryRun ? "dry-run" : "apply",
        selected: candidates.length,
        checked,
        changed,
        dueDateChanges,
        proposalChanges,
        warnings,
      },
      null,
      2
    )
  )
}

await main()
