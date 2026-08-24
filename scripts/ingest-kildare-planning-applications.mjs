import { createClient } from "@supabase/supabase-js"

import { planningEircodeFieldsFromSources } from "../lib/eircode-ingestion.mjs"
import { buildEplanApplicationUrl } from "../lib/eplan-planning-source.mjs"
import { filterChangedPlanningRecords } from "../lib/planning-ingestion-diff.mjs"
import { upsertPlanningBatch } from "./planning-upsert.mjs"
import { formatErrorForLog } from "./ppr-error-format.mjs"

const LOCAL_AUTHORITY = "Kildare County Council"
const LOCAL_AUTHORITY_CODE = "KILDARE"
const SOURCE_PAGE_URL = "https://webgeo.kildarecoco.ie/planningenquiry"
const SOURCE_API_URL = `${SOURCE_PAGE_URL}/Public/GetPlanningFileNameAddressResult`
const DEFAULT_DAYS = Number(process.env.PLANNING_KILDARE_DEFAULT_DAYS || 120)
const REQUEST_RETRIES = 4
const PRESERVE_WEAKER_FIELDS = [
  "source_application_id",
  "web_reference",
  "application_type",
  "proposal",
  "location",
  "applicant_name",
  "agent_name",
  "status",
  "decision_text",
  "registration_date",
  "valid_date",
  "decision_date",
  "decision_due_date",
  "final_grant_date",
  "expiry_date",
  "further_information_requested_date",
  "further_information_received_date",
  "withdrawal_date",
  "appeal_lodged_date",
  "appeal_decision_date",
  "dispatch_date",
  "appeal_notify_date",
  "ward",
  "area_ids",
  "ward_ids",
  "parish_ids",
  "grid_reference",
  "grid_easting",
  "grid_northing",
  "pending_amendment",
  "eircode",
  "eircode_prefix",
]

function cleanText(value) {
  const text = String(value ?? "").replace(/\s+/g, " ").trim()
  return text && !/^(?:n\/?a|null|undefined)$/i.test(text) ? text : null
}

function parseKildareDate(value) {
  const match = String(value || "").trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
  if (!match || match[3] === "1900") return null
  const iso = `${match[3]}-${match[2]}-${match[1]}`
  const date = new Date(`${iso}T00:00:00Z`)
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== iso
    ? null
    : iso
}

function mapKildareApplication(row) {
  const reference = cleanText(row.FileNumber)?.replace(/\s+/g, "")
  if (!reference || !/^\d+$/.test(reference)) return null
  const location = cleanText(row.DevelopmentAddress)
  return {
    local_authority: LOCAL_AUTHORITY,
    local_authority_code: LOCAL_AUTHORITY_CODE,
    source_application_id: null,
    reference,
    web_reference: reference,
    application_type: cleanText(row.Type),
    proposal: cleanText(row.DevelopmentDescription),
    location,
    ...planningEircodeFieldsFromSources(location),
    applicant_name: cleanText(row.ApplicantName),
    agent_name: null,
    status: cleanText(row.ApplicationStatus),
    decision_text: cleanText(row.Decision),
    registration_date: parseKildareDate(row.DateReceived),
    valid_date: null,
    decision_date: parseKildareDate(row.DecisionDateMO),
    decision_due_date: parseKildareDate(row.DueDate),
    final_grant_date: parseKildareDate(row.GrantDate),
    expiry_date: null,
    further_information_requested_date: parseKildareDate(row.FurtherInfoRequested),
    further_information_received_date: parseKildareDate(row.FurtherInfoReceived),
    withdrawal_date: null,
    appeal_lodged_date: null,
    appeal_decision_date: null,
    dispatch_date: null,
    appeal_notify_date: null,
    ward: null,
    area_ids: [],
    ward_ids: [],
    parish_ids: [],
    grid_reference: null,
    grid_easting: null,
    grid_northing: null,
    pending_amendment: null,
    source_url: buildEplanApplicationUrl(LOCAL_AUTHORITY_CODE, reference) || SOURCE_PAGE_URL,
    source_api_url: SOURCE_API_URL,
    updated_at: new Date().toISOString(),
  }
}

function addDays(value, days) {
  const date = new Date(value)
  date.setUTCDate(date.getUTCDate() + days)
  return date
}

function dateArg(value) {
  if (!value) return null
  const date = new Date(`${value}T00:00:00Z`)
  if (Number.isNaN(date.getTime())) throw new Error(`Invalid date ${value}; use YYYY-MM-DD`)
  return date
}

function formatDate(value) {
  return value.toISOString().slice(0, 10)
}

function parseArgs(args) {
  const dryRun = args.includes("--dry-run")
  const positional = args.filter((arg) => arg !== "--dry-run")
  const to = dateArg(positional[1]) || new Date(`${formatDate(new Date())}T00:00:00Z`)
  const from = dateArg(positional[0]) || addDays(to, -DEFAULT_DAYS)
  if (from > to) throw new Error("from date must be before to date")
  return { dryRun, from, to }
}

async function fetchKildareRegister(fetchImpl = fetch) {
  const url = new URL(SOURCE_API_URL)
  // The council endpoint requires a general-search criterion. Its date inputs
  // are not applied reliably server-side, so ingestion filters this bounded
  // corpus locally and never calls the source from a user-facing request.
  url.searchParams.set("name", "")
  url.searchParams.set("address", "")
  url.searchParams.set("devDesc", "")
  url.searchParams.set("startDate", "01/01/1900")
  url.searchParams.set("endDate", "31/12/2099")

  let lastError
  for (let attempt = 1; attempt <= REQUEST_RETRIES; attempt += 1) {
    try {
      const response = await fetchImpl(url, {
        headers: { "User-Agent": "OpenList Kildare planning importer (+https://www.openlist.ie)" },
      })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const rows = await response.json()
      if (!Array.isArray(rows)) throw new Error("unexpected response")
      return rows
    } catch (error) {
      lastError = error
      if (attempt < REQUEST_RETRIES) {
        await new Promise((resolve) => setTimeout(resolve, attempt * 1500))
      }
    }
  }
  throw lastError
}

async function fetchKildarePlanningApplications({ from, to, fetchImpl = fetch }) {
  const rows = await fetchKildareRegister(fetchImpl)
  const fromDate = formatDate(from)
  const toDate = formatDate(to)
  const records = rows
    .map(mapKildareApplication)
    .filter((record) =>
      record?.registration_date &&
      record.registration_date >= fromDate &&
      record.registration_date <= toDate
    )
  const byReference = new Map(records.map((record) => [record.reference, record]))
  return [...byReference.values()].sort((left, right) =>
    left.registration_date.localeCompare(right.registration_date) ||
    left.reference.localeCompare(right.reference)
  )
}

async function ingestKildarePlanningApplications({ from, to, dryRun = false }) {
  const records = await fetchKildarePlanningApplications({ from, to })
  console.log(
    `Kildare official register: ${records.length} unique applications from ${formatDate(from)} to ${formatDate(to)}.`
  )
  if (dryRun) return { records, changedRows: 0 }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY")
  }
  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { changedRecords, unchangedCount, changeFieldCounts, changedSample } =
    await filterChangedPlanningRecords(supabase, records, {
      authorityCode: LOCAL_AUTHORITY_CODE,
      from: formatDate(from),
      to: formatDate(to),
      preserveWeakerFields: PRESERVE_WEAKER_FIELDS,
    })
  console.log(
    `Kildare changes ${JSON.stringify(changeFieldCounts)}; sample ${JSON.stringify(changedSample)}`
  )
  for (let index = 0; index < changedRecords.length; index += 50) {
    await upsertPlanningBatch(
      supabase,
      changedRecords.slice(index, index + 50),
      LOCAL_AUTHORITY
    )
  }
  console.log(
    `Kildare: upserted ${changedRecords.length} changed/new rows; skipped ${unchangedCount} unchanged rows.`
  )
  return { records, changedRows: changedRecords.length, unchangedRows: unchangedCount }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  ingestKildarePlanningApplications(parseArgs(process.argv.slice(2))).catch((error) => {
    console.error(formatErrorForLog(error))
    process.exit(1)
  })
}

export {
  fetchKildarePlanningApplications,
  ingestKildarePlanningApplications,
  mapKildareApplication,
  parseKildareDate,
}
