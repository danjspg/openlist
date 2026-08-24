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
import {
  PLANNING_COMPARISON_FIELDS,
  planningRecordChangedFields,
} from "../lib/planning-ingestion-diff.mjs"
import {
  corkAgileApplicationConfig,
  corkAgileAuthorityConfig,
} from "../lib/cork-agile-authorities.mjs"
import {
  AUTHORITIES,
  enrichChangedNationalRecords,
  mapApplication,
} from "./ingest-national-planning-applications.mjs"
import { upsertPlanningBatch } from "./planning-upsert.mjs"

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
const nationalBatchSize = 150
const nationalFeatureUrl =
  "https://services.arcgis.com/NzlPQPKn5QF9v2US/ArcGIS/rest/services/IrishPlanningApplications/FeatureServer/0/query"
const rangeDelayMs = Math.max(
  0,
  Number(process.env.PLANNING_ACTIVE_REFRESH_RANGE_DELAY_MS || 500)
)
const dryRun = process.argv.includes("--dry-run")

const preserveWhenSourceNull = [
  "registration_date",
  "valid_date",
  "decision_due_date",
  "further_information_requested_date",
  "further_information_received_date",
  "decision_date",
  "final_grant_date",
  "withdrawal_date",
  "appeal_lodged_date",
  "appeal_decision_date",
  "expiry_date",
  "dispatch_date",
  "appeal_notify_date",
]

function todayUtc() {
  return new Date().toISOString().slice(0, 10)
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function chunks<T>(items: T[], size: number) {
  const result: T[][] = []
  for (let index = 0; index < items.length; index += size) {
    result.push(items.slice(index, index + size))
  }
  return result
}

type CandidateRow = ActivePlanningRefreshCandidate & Record<string, any>

const candidateSelect = Array.from(
  new Set(["id", "normalized_status", ...PLANNING_COMPARISON_FIELDS])
).join(",")

async function fetchPagedCandidates(
  label: string,
  configure: (query: any) => any
): Promise<CandidateRow[]> {
  const rows: CandidateRow[] = []
  for (let offset = 0; ; offset += pageSize) {
    let query = supabase
      .from("planning_applications")
      .select(candidateSelect)
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

function preserveKnownSourceHistory(existing: CandidateRow, incoming: Record<string, any>) {
  const result = { ...incoming }
  for (const field of preserveWhenSourceNull) {
    if ((result[field] === null || result[field] === undefined) && existing[field]) {
      result[field] = existing[field]
    }
  }

  const currentProposal = String(existing.proposal || "").trim().replace(/\s+/g, " ")
  const incomingProposal = String(result.proposal || "").trim().replace(/\s+/g, " ")
  if (
    currentProposal &&
    incomingProposal &&
    currentProposal.length > incomingProposal.length &&
    currentProposal.startsWith(incomingProposal)
  ) {
    result.proposal = existing.proposal
  }
  return result
}

async function fetchNationalFeatures(sourceIds: number[]) {
  const params = new URLSearchParams({
    where: `OBJECTID IN (${sourceIds.join(",")})`,
    outFields: "*",
    returnGeometry: "false",
    f: "json",
    resultRecordCount: String(sourceIds.length),
  })
  let lastError: Error | null = null

  for (let attempt = 1; attempt <= 4; attempt += 1) {
    try {
      const response = await fetch(`${nationalFeatureUrl}?${params.toString()}`, {
        headers: { "User-Agent": "OpenList daily active planning refresh" },
      })
      if (response.ok) {
        const data = await response.json()
        if (data.error) throw new Error(data.error.message || JSON.stringify(data.error))
        return (data.features || []).map((feature: any) => feature.attributes || {})
      }
      lastError = new Error(`ArcGIS active refresh: HTTP ${response.status}`)
      if (![408, 425, 429, 500, 502, 503, 504].includes(response.status)) break
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error))
    }
    await sleep(attempt * 750)
  }
  throw lastError || new Error("ArcGIS active refresh failed")
}

async function refreshNationalExact(candidates: CandidateRow[]) {
  const authorityByCode = new Map(AUTHORITIES.map((authority: any) => [authority.code, authority]))
  const candidatesByAuthority = new Map<string, CandidateRow[]>()
  const fallback: CandidateRow[] = []

  for (const candidate of candidates) {
    if (corkAgileApplicationConfig(candidate)) {
      fallback.push(candidate)
      continue
    }
    const sourceId = Number(candidate.source_application_id)
    if (!Number.isInteger(sourceId) || !authorityByCode.has(candidate.local_authority_code)) {
      fallback.push(candidate)
      continue
    }
    const rows = candidatesByAuthority.get(candidate.local_authority_code) || []
    rows.push(candidate)
    candidatesByAuthority.set(candidate.local_authority_code, rows)
  }

  let checked = 0
  let changed = 0
  const changeFieldCounts: Record<string, number> = {}

  for (const [authorityCode, authorityCandidates] of Array.from(candidatesByAuthority.entries()).sort()) {
    const authority: any = authorityByCode.get(authorityCode)
    console.log(
      `${authorityCode}: exact authoritative refresh for ${authorityCandidates.length} active/follow-up applications.`
    )

    for (const batch of chunks(authorityCandidates, nationalBatchSize)) {
      const sourceIds = batch.map((row) => Number(row.source_application_id))
      const sourceRows = await fetchNationalFeatures(sourceIds)
      const sourceIdsReturned = new Set(sourceRows.map((row: any) => Number(row.OBJECTID)))
      const missing = batch.filter(
        (candidate) => !sourceIdsReturned.has(Number(candidate.source_application_id))
      )
      fallback.push(...missing)

      let mapped = sourceRows
        .map((row: any) => mapApplication(row, authority, { storePayload: false }))
        .filter(Boolean)
      mapped = await enrichChangedNationalRecords(mapped, authority, undefined, {
        failureMode: "best-effort",
        budget: 100,
      })
      const incomingByReference = new Map(
        mapped.map((record: any) => [record.reference, record])
      )
      const changedRecords: Record<string, any>[] = []

      for (const candidate of batch) {
        const incoming = incomingByReference.get(candidate.reference)
        if (!incoming) continue
        checked += 1
        const safeIncoming = preserveKnownSourceHistory(candidate, incoming)
        const fields = planningRecordChangedFields(candidate, safeIncoming)
        if (fields.length === 0) continue
        changed += 1
        for (const field of fields) {
          changeFieldCounts[field] = (changeFieldCounts[field] || 0) + 1
        }
        console.log(`${authorityCode} ${candidate.reference}: ${fields.join(", ")}`)
        changedRecords.push(safeIncoming)
      }

      if (!dryRun) {
        for (const writeBatch of chunks(changedRecords, 50)) {
          await upsertPlanningBatch(
            supabase,
            writeBatch,
            `${authorityCode} active exact refresh`
          )
        }
      }
    }
  }

  return { checked, changed, changeFieldCounts, fallback }
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
  const runCorkAgileRange = async (rangeFrom: string, rangeTo: string) => {
    const args = [
      "scripts/ingest-cork-planning-applications.mjs",
      rangeFrom,
      rangeTo,
      "--window-days",
      "7",
      "--authority",
      localAuthorityCode,
    ]
    if (dryRun) args.push("--dry-run")
    await runChild(args)
  }

  const agileConfig = corkAgileAuthorityConfig(localAuthorityCode)
  if (agileConfig && !agileConfig.agileStartDate) {
    await runCorkAgileRange(from, to)
    return
  }

  const agileStartDate = agileConfig?.agileStartDate
  if (agileStartDate && to >= agileStartDate) {
    if (from < agileStartDate) {
      await runChild([
        "scripts/ingest-national-planning-applications.mjs",
        "--from",
        from,
        "--to",
        subtractUtcDays(agileStartDate, 1),
        "--authority",
        localAuthorityCode,
        ...(dryRun ? ["--dry-run"] : []),
      ])
    }
    await runCorkAgileRange(
      from < agileStartDate ? agileStartDate : from,
      to
    )
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
  const exact = await refreshNationalExact(cohort.candidates)
  const fallbackById = new Map(exact.fallback.map((row) => [row.id, row]))
  const fallbackCandidates = Array.from(fallbackById.values())
  const ranges = buildActivePlanningRefreshRanges(fallbackCandidates, today)
  const untargetable = fallbackCandidates.filter((row) => !row.registration_date)

  console.log(
    `Daily active Planning refresh ${dryRun ? "dry run" : "run"}: ${cohort.candidates.length} unique candidates.`
  )
  console.log(
    `Cohort composition: ${cohort.activeCount} live-status rows; ${cohort.recentDecisionCount} decision-made follow-up rows since ${cohort.decisionCutoff}; ${cohort.recentUnknownCount} recent unclassified rows since ${cohort.unknownCutoff}.`
  )
  console.log(
    `National exact refresh: ${exact.checked} checked, ${exact.changed} changed; fallback/date-range cohort ${fallbackCandidates.length} across ${ranges.length} authority/date ranges.`
  )
  if (Object.keys(exact.changeFieldCounts).length > 0) {
    console.log(`National exact changed fields: ${JSON.stringify(exact.changeFieldCounts)}`)
  }
  if (untargetable.length > 0) {
    console.warn(
      `${untargetable.length} fallback rows have no registration date and could not be refreshed by a source date range.`
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
    `Daily active Planning refresh completed: ${cohort.candidates.length} candidates; ${exact.checked} exact national checks; ${ranges.length} fallback/source ranges.`
  )
}

await main()
