import { createClient } from "@supabase/supabase-js"
import { formatErrorForLog } from "./ppr-error-format.mjs"

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

const API_URL = "https://planningapi.agileapplications.ie/api/application/search"
const SOURCE_URL = "https://planning.agileapplications.ie/corkcoco/search-applications/"
const LOCAL_AUTHORITY = "Cork County Council"
const LOCAL_AUTHORITY_CODE = "CORKCOCO"
const PRODUCT_CODE = "CITIZENPORTAL"
const SERVICE_CODE = "PA"
const DEFAULT_WINDOW_DAYS = 7
const DEFAULT_RANGE_YEARS = 3
const SEARCH_STATUSES = ["registered", "determined"]

if (!supabaseUrl || !serviceRoleKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY")
  process.exit(1)
}

const supabase = createClient(supabaseUrl, serviceRoleKey)

function formatDate(date) {
  return date.toISOString().slice(0, 10)
}

function addDays(date, days) {
  const next = new Date(date)
  next.setUTCDate(next.getUTCDate() + days)
  return next
}

function parseDateArg(value) {
  if (!value) return null
  const date = new Date(`${value}T00:00:00Z`)
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Invalid date: ${value}. Use YYYY-MM-DD.`)
  }
  return date
}

function defaultDateRange() {
  const to = new Date()
  to.setUTCHours(0, 0, 0, 0)
  const from = new Date(to)
  from.setUTCFullYear(from.getUTCFullYear() - DEFAULT_RANGE_YEARS)
  return { from, to }
}

function parseIrishGridReference(value) {
  if (!value) return { easting: null, northing: null }
  const [rawEasting, rawNorthing] = String(value)
    .split(",")
    .map((part) => Number(part.trim()))

  return {
    easting: Number.isFinite(rawEasting) ? rawEasting : null,
    northing: Number.isFinite(rawNorthing) ? rawNorthing : null,
  }
}

function parseApiDate(value) {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return formatDate(date)
}

function normaliseIdArray(value) {
  if (!Array.isArray(value)) return []
  return value.map((item) => Number(item)).filter((item) => Number.isInteger(item))
}

function applicationDetailUrl(row) {
  const reference = row.reference
  if (!reference) return SOURCE_URL

  const encodedReference = encodeURIComponent(reference)
  return `https://planning.agileapplications.ie/corkcoco/application-details/?ref=${encodedReference}`
}

function mapApplication(row) {
  const grid = parseIrishGridReference(row.gridReference)

  return {
    local_authority: LOCAL_AUTHORITY,
    local_authority_code: LOCAL_AUTHORITY_CODE,
    source_application_id: Number.isInteger(row.id) ? row.id : null,
    reference: row.reference,
    web_reference: row.webReference || null,
    application_type: row.applicationType || null,
    proposal: row.proposal || null,
    location: row.location || null,
    applicant_name: row.applicantSurname || null,
    agent_name: row.agentName || null,
    status: row.status || null,
    decision_text: row.decisionText || null,
    registration_date: parseApiDate(row.registrationDate),
    valid_date: parseApiDate(row.validDate),
    decision_date: parseApiDate(row.decisionDate),
    final_grant_date: parseApiDate(row.finalGrantDate),
    appeal_lodged_date: parseApiDate(row.appealLodgedDate),
    appeal_decision_date: parseApiDate(row.appealDecisionDate),
    dispatch_date: parseApiDate(row.dispatchDate),
    appeal_notify_date: parseApiDate(row.appealNotifyDate),
    ward: row.ward || null,
    area_ids: normaliseIdArray(row.areaId),
    ward_ids: normaliseIdArray(row.wardId),
    parish_ids: normaliseIdArray(row.parishId),
    grid_reference: row.gridReference || null,
    grid_easting: grid.easting,
    grid_northing: grid.northing,
    pending_amendment:
      typeof row.pendingAmendment === "boolean" ? row.pendingAmendment : null,
    source_url: applicationDetailUrl(row),
    source_api_url: API_URL,
    source_payload: row,
    updated_at: new Date().toISOString(),
  }
}

function chunk(items, size) {
  const chunks = []
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size))
  return chunks
}

function windowsBetween(from, to, windowDays) {
  const windows = []
  let cursor = new Date(from)

  while (cursor <= to) {
    const windowEnd = addDays(cursor, windowDays - 1)
    if (windowEnd > to) windowEnd.setTime(to.getTime())
    windows.push({ from: new Date(cursor), to: new Date(windowEnd) })
    cursor = addDays(windowEnd, 1)
  }

  return windows
}

async function fetchApplicationsWindow({ from, to, status }) {
  const params = new URLSearchParams({
    registrationDateFrom: `${formatDate(from)}T00:00:00Z`,
    registrationDateTo: `${formatDate(to)}T23:59:59Z`,
    status,
  })
  const url = `${API_URL}?${params.toString()}`
  const response = await fetch(url, {
    headers: {
      "User-Agent": "OpenList planning applications importer",
      "x-client": LOCAL_AUTHORITY_CODE,
      "x-product": PRODUCT_CODE,
      "x-service": SERVICE_CODE,
    },
  })

  if (!response.ok) {
    throw new Error(`Planning API request failed: HTTP ${response.status}`)
  }

  const data = await response.json()
  if (Array.isArray(data) && data[0]?.code) {
    throw new Error(data[0].message || "Planning API returned an error")
  }

  if (!data || !Array.isArray(data.results)) {
    throw new Error("Planning API returned an unexpected response")
  }

  return data
}

async function countExistingApplications(from, to) {
  const { count, error } = await supabase
    .from("planning_applications")
    .select("id", { count: "exact", head: true })
    .eq("local_authority_code", LOCAL_AUTHORITY_CODE)
    .gte("registration_date", formatDate(from))
    .lte("registration_date", formatDate(to))

  if (error) throw error
  return count || 0
}

async function fetchApplicationRecords({ from, to, windowDays = DEFAULT_WINDOW_DAYS }) {
  const recordsByReference = new Map()
  const windows = windowsBetween(from, to, windowDays)

  for (const window of windows) {
    const label = `${formatDate(window.from)} to ${formatDate(window.to)}`
    for (const status of SEARCH_STATUSES) {
      const data = await fetchApplicationsWindow({ ...window, status })

      console.log(
        `${label} ${status}: fetched ${data.results.length}/${data.total} applications`
      )

      if (data.total > data.results.length && windowDays > 1) {
        const smallerRecords = await fetchApplicationRecords({
          from: window.from,
          to: window.to,
          windowDays: Math.max(1, Math.floor(windowDays / 2)),
        })
        for (const record of smallerRecords) {
          recordsByReference.set(record.reference, record)
        }
        continue
      }

      for (const row of data.results) {
        if (!row.reference) continue
        const record = mapApplication(row)
        recordsByReference.set(record.reference, record)
      }
    }
  }

  return Array.from(recordsByReference.values())
}

async function ingestPlanningApplications({ from, to, windowDays = DEFAULT_WINDOW_DAYS } = {}) {
  if (!from || !to) {
    const defaults = defaultDateRange()
    from ||= defaults.from
    to ||= defaults.to
  }

  if (from > to) {
    throw new Error("from date must be before to date")
  }

  const countBefore = await countExistingApplications(from, to)
  const records = await fetchApplicationRecords({ from, to, windowDays })
  let processed = 0

  for (const batch of chunk(records, 100)) {
    const { error } = await supabase
      .from("planning_applications")
      .upsert(batch, {
        onConflict: "local_authority_code,reference",
      })

    if (error) {
      throw new Error(
        `planning_applications upsert failed after ${processed}/${records.length} rows`,
        { cause: error }
      )
    }

    processed += batch.length
    console.log(`processed ${processed}/${records.length}`)
  }

  const countAfter = await countExistingApplications(from, to)
  const importedRows = Math.max(0, countAfter - countBefore)

  console.log(
    `Done. Processed ${records.length} Cork County planning applications, imported ${importedRows} new rows (${countAfter} total in range).`
  )

  return {
    from: formatDate(from),
    to: formatDate(to),
    importedRows,
    processedRows: records.length,
    records,
    totalRows: countAfter,
  }
}

async function fetchPlanningApplications({ from, to, windowDays = DEFAULT_WINDOW_DAYS } = {}) {
  if (!from || !to) {
    const defaults = defaultDateRange()
    from ||= defaults.from
    to ||= defaults.to
  }

  if (from > to) {
    throw new Error("from date must be before to date")
  }

  const records = await fetchApplicationRecords({ from, to, windowDays })
  console.log(
    `Done. Fetched ${records.length} Cork County planning applications from ${formatDate(from)} to ${formatDate(to)}.`
  )

  return {
    from: formatDate(from),
    to: formatDate(to),
    processedRows: records.length,
    records,
  }
}

const isDirectRun = import.meta.url === `file://${process.argv[1]}`

if (isDirectRun) {
  const args = process.argv.slice(2)
  const dryRun = args.includes("--dry-run")
  const positionalArgs = args.filter((arg) => arg !== "--dry-run")
  const from = parseDateArg(positionalArgs[0])
  const to = parseDateArg(positionalArgs[1])
  const runner = dryRun ? fetchPlanningApplications : ingestPlanningApplications

  runner({ from, to }).catch((error) => {
    console.error(formatErrorForLog(error))
    process.exit(1)
  })
}

export { fetchPlanningApplications, ingestPlanningApplications }
