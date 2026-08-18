import { createClient } from "@supabase/supabase-js"
import {
  authoritativeCorkProposal,
  isLikelyTruncatedCorkSearchProposal,
  parseCorkCouncilDate,
} from "../lib/cork-planning-source.mjs"

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!supabaseUrl || !serviceRoleKey) {
  throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY")
}

const API_SEARCH_URL = "https://planningapi.agileapplications.ie/api/application/search"
const API_DETAIL_URL = "https://planningapi.agileapplications.ie/api/application"
const AUTHORITY_CODE = "CORKCOCO"
const SEARCH_STATUSES = ["registered", "determined"]
const DATE_FIELDS = [
  ["registration_date", "registrationDate"],
  ["valid_date", "validDate"],
  ["decision_date", "decisionDate"],
  ["final_grant_date", "finalGrantDate"],
  ["appeal_lodged_date", "appealLodgedDate"],
  ["appeal_decision_date", "appealDecisionDate"],
  ["dispatch_date", "dispatchDate"],
  ["appeal_notify_date", "appealNotifyDate"],
]
const args = process.argv.slice(2)
const applyDates = args.includes("--apply-dates")
const proposalArg = args.find((arg) => arg.startsWith("--proposal-reference="))
const proposalReference = proposalArg?.slice("--proposal-reference=".length) || null
const proposalLimitArg = args.find((arg) => arg.startsWith("--proposal-limit="))
const proposalLimit = Math.max(
  0,
  Math.min(250, Number(proposalLimitArg?.slice("--proposal-limit=".length) || 0))
)
const proposalAfterArg = args.find((arg) => arg.startsWith("--proposal-after="))
const proposalAfter = proposalAfterArg?.slice("--proposal-after=".length) || ""
const fromYearArg = args.find((arg) => arg.startsWith("--from-year="))
const fromYear = Number(fromYearArg?.slice("--from-year=".length) || 2012)
const currentYear = new Date().getUTCFullYear()
const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
})

const headers = {
  "User-Agent": "OpenList Cork planning source audit",
  "x-client": AUTHORITY_CODE,
  "x-product": "CITIZENPORTAL",
  "x-service": "PA",
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function fetchJson(url, label) {
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    const response = await fetch(url, { headers })
    if (response.ok) return response.json()
    if (attempt === 5 || ![408, 425, 429, 500, 502, 503, 504].includes(response.status)) {
      throw new Error(`${label} failed with HTTP ${response.status}`)
    }
    await sleep(1000 * 2 ** (attempt - 1))
  }
}

async function fetchCouncilSearchRows() {
  const byReference = new Map()
  for (let year = fromYear; year <= currentYear; year += 1) {
    for (const status of SEARCH_STATUSES) {
      const params = new URLSearchParams({
        registrationDateFrom: `${year}-01-01T00:00:00Z`,
        registrationDateTo: `${year}-12-31T23:59:59Z`,
        status,
      })
      const data = await fetchJson(`${API_SEARCH_URL}?${params}`, `${year} ${status}`)
      if (!Array.isArray(data?.results) || Number(data.total) > data.results.length) {
        throw new Error(`${year} ${status} did not return its complete result set`)
      }
      for (const row of data.results) {
        if (row.reference) byReference.set(row.reference, row)
      }
      await sleep(200)
    }
  }
  return byReference
}

async function fetchStoredRows() {
  const rows = []
  const pageSize = 1000
  let afterReference = null
  while (true) {
    let query = supabase
      .from("planning_applications")
      .select([
        "id",
        "source_application_id",
        "reference",
        "proposal",
        ...DATE_FIELDS.map(([field]) => field),
      ].join(","))
      .eq("local_authority_code", AUTHORITY_CODE)
      .order("reference", { ascending: true })
      .limit(pageSize)
    if (afterReference) query = query.gt("reference", afterReference)
    const { data, error } = await query
    if (error) throw error
    rows.push(...(data || []))
    if (!data || data.length < pageSize) break
    afterReference = data.at(-1).reference
  }
  return rows
}

const [sourceByReference, storedRows] = await Promise.all([
  fetchCouncilSearchRows(),
  fetchStoredRows(),
])
const mismatchesByField = Object.fromEntries(DATE_FIELDS.map(([field]) => [field, 0]))
const mismatchKindsByField = Object.fromEntries(
  DATE_FIELDS.map(([field]) => [field, {}])
)
const repairs = []
let missingFromSearch = 0
let likelyTruncatedStored = 0

for (const stored of storedRows) {
  if (isLikelyTruncatedCorkSearchProposal(stored.proposal)) likelyTruncatedStored += 1
  const source = sourceByReference.get(stored.reference)
  if (!source) {
    missingFromSearch += 1
    continue
  }

  const repair = { id: stored.id, reference: stored.reference }
  let differs = false
  for (const [storedField, sourceField] of DATE_FIELDS) {
    const sourceDate = parseCorkCouncilDate(source[sourceField])
    repair[storedField] = sourceDate
    if ((stored[storedField] || null) !== sourceDate) {
      mismatchesByField[storedField] += 1
      const storedDate = stored[storedField] || null
      const kind = !storedDate
        ? "missing_in_openlist"
        : !sourceDate
          ? "absent_in_current_source"
          : `${Math.round(
              (Date.parse(`${sourceDate}T00:00:00Z`) -
                Date.parse(`${storedDate}T00:00:00Z`)) /
                86_400_000
            )}_days`
      mismatchKindsByField[storedField][kind] =
        (mismatchKindsByField[storedField][kind] || 0) + 1
      differs = true
    }
  }
  if (differs) repairs.push(repair)
}

const report = {
  sourceApplications: sourceByReference.size,
  storedApplications: storedRows.length,
  missingFromSearch,
  likelyTruncatedStored,
  dateRepairApplications: repairs.length,
  mismatchesByField,
  mismatchKindsByField,
}
console.log(JSON.stringify(report, null, 2))

if (applyDates) {
  let updated = 0
  for (let index = 0; index < repairs.length; index += 250) {
    const batch = repairs.slice(index, index + 250)
    const { data, error } = await supabase.rpc("openlist_repair_cork_planning_dates", {
      p_repairs: batch,
    })
    if (error) throw error
    updated += Number(data?.updated || 0)
    console.log(`Corrected ${updated}/${repairs.length} Cork planning applications.`)
  }
}

if (proposalReference) {
  const stored = storedRows.find((row) => row.reference === proposalReference)
  const source = sourceByReference.get(proposalReference)
  const applicationId = Number(source?.id || stored?.source_application_id)
  if (!stored || !Number.isInteger(applicationId)) {
    throw new Error(`Cannot resolve ${proposalReference} to a stored Cork application`)
  }
  const detail = await fetchJson(
    `${API_DETAIL_URL}/${applicationId}`,
    `${proposalReference} detail`
  )
  const proposal = authoritativeCorkProposal(stored.proposal, detail.fullProposal)
  if (proposal && proposal !== stored.proposal) {
    const { error } = await supabase
      .from("planning_applications")
      .update({ proposal, updated_at: new Date().toISOString() })
      .eq("id", stored.id)
      .eq("local_authority_code", AUTHORITY_CODE)
    if (error) throw error
    console.log(`Stored the authoritative full proposal for ${proposalReference}.`)
  } else {
    console.log(`No proposal update was needed for ${proposalReference}.`)
  }
}

if (proposalLimit > 0) {
  const { data: candidates, error: candidateError } = await supabase.rpc(
    "openlist_planning_proposal_backfill_candidates",
    {
      p_authority_code: AUTHORITY_CODE,
      p_limit: proposalLimit,
      p_from: `${fromYear}-01-01`,
      p_to: `${currentYear}-12-31`,
    }
  )
  if (candidateError) throw candidateError
  let updated = 0
  for (const stored of candidates || []) {
    const detail = await fetchJson(
      `${API_DETAIL_URL}/${Number(stored.source_application_id)}`,
      `${stored.reference} detail`
    )
    const proposal = authoritativeCorkProposal(stored.proposal, detail.fullProposal)
    if (proposal && proposal !== stored.proposal) {
      const { error } = await supabase
        .from("planning_applications")
        .update({ proposal, updated_at: new Date().toISOString() })
        .eq("id", stored.id)
        .eq("local_authority_code", AUTHORITY_CODE)
      if (error) throw error
      updated += 1
    }
    await sleep(200)
  }
  console.log(JSON.stringify({
    proposalCandidatesProcessed: candidates?.length || 0,
    proposalsUpdated: updated,
    prioritized: {
      highValue: (candidates || []).filter((candidate) => candidate.priority === 0).length,
      recentActive: (candidates || []).filter((candidate) => candidate.priority === 1).length,
      historical: (candidates || []).filter((candidate) => candidate.priority === 2).length,
    },
    cursorIgnored: Boolean(proposalAfter),
    nextProposalAfter: null,
  }, null, 2))
}
