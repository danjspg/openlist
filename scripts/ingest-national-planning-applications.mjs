import { createClient } from "@supabase/supabase-js"
import { formatErrorForLog } from "./ppr-error-format.mjs"
import { planningEircodeFieldsFromSources } from "../lib/eircode-ingestion.mjs"
import { filterChangedPlanningRecords } from "../lib/planning-ingestion-diff.mjs"
import { upsertPlanningBatch } from "./planning-upsert.mjs"
import {
  authoritativeNationalProposal,
  cleanNationalPlanningText,
  isNationalProposalDetailCandidate,
  nationalAgileAuthorityConfig,
  nationalPlanningSourceUrl,
  parseNationalArcgisDate,
} from "../lib/national-planning-source.mjs"

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

const FEATURE_LAYER_URL =
  "https://services.arcgis.com/NzlPQPKn5QF9v2US/ArcGIS/rest/services/IrishPlanningApplications/FeatureServer/0/query"
const AGILE_SEARCH_URL = "https://planningapi.agileapplications.ie/api/application/search"
const AGILE_DETAIL_URL = "https://planningapi.agileapplications.ie/api/application"
const AGILE_SEARCH_STATUSES = ["registered", "determined"]
const AGILE_WINDOW_DAYS = 45
const DEFAULT_DAYS = Number(process.env.PLANNING_NATIONAL_DEFAULT_DAYS || 365)
const DEFAULT_PAGE_SIZE = 2000
const DEFAULT_EXCLUDED_CODES = new Set(["CORKCOCO"])
const REQUEST_DELAY_MS = Number(process.env.PLANNING_NATIONAL_REQUEST_DELAY_MS || 250)
const MAX_RETRIES = Number(process.env.PLANNING_NATIONAL_MAX_RETRIES || 4)

const AUTHORITIES = [
  {
    name: "Cork County Council",
    code: "CORKCOCO",
    sourceName: "Cork County Council",
  },
  {
    name: "Cork City Council",
    code: "CORKCITY",
    sourceName: "Cork City Council",
  },
  {
    name: "Dublin City Council",
    code: "DUBLINCITY",
    sourceName: "Dublin City Council",
  },
  {
    name: "Fingal County Council",
    code: "FINGAL",
    sourceName: "Fingal County Council",
  },
  {
    name: "South Dublin County Council",
    code: "SOUTHDUBLIN",
    sourceName: "South Dublin County Council",
  },
  {
    name: "Dun Laoghaire-Rathdown County Council",
    code: "DLR",
    sourceName: "Dun Laoghaire Rathdown County Council",
  },
  {
    name: "Kildare County Council",
    code: "KILDARE",
    sourceName: "Kildare County Council",
  },
  {
    name: "Galway County Council",
    code: "GALWAYCOCO",
    sourceName: "Galway County Council",
  },
  {
    name: "Galway City Council",
    code: "GALWAYCITY",
    sourceName: "Galway City Council",
  },
  {
    name: "Meath County Council",
    code: "MEATH",
    sourceName: "Meath County Council",
  },
  {
    name: "Wicklow County Council",
    code: "WICKLOW",
    sourceName: "Wicklow County Council",
  },
  {
    name: "Limerick City and County Council",
    code: "LIMERICK",
    sourceName: "Limerick County Council",
  },
  {
    name: "Waterford City and County Council",
    code: "WATERFORD",
    sourceName: "Waterford City and County Council",
  },
  {
    name: "Donegal County Council",
    code: "DONEGAL",
    sourceName: "Donegal County Council",
  },
  {
    name: "Wexford County Council",
    code: "WEXFORD",
    sourceName: "Wexford County Council",
  },
  {
    name: "Tipperary County Council",
    code: "TIPPERARY",
    sourceName: "Tipperary County Council",
  },
  {
    name: "Kerry County Council",
    code: "KERRY",
    sourceName: "Kerry County Council",
  },
  {
    name: "Mayo County Council",
    code: "MAYO",
    sourceName: "Mayo County Council",
  },
  {
    name: "Clare County Council",
    code: "CLARE",
    sourceName: "Clare County Council",
  },
  {
    name: "Louth County Council",
    code: "LOUTH",
    sourceName: "Louth County Council",
  },
  {
    name: "Laois County Council",
    code: "LAOIS",
    sourceName: "Laois County Council",
  },
  {
    name: "Kilkenny County Council",
    code: "KILKENNY",
    sourceName: "Kilkenny County Council",
  },
  {
    name: "Offaly County Council",
    code: "OFFALY",
    sourceName: "Offaly County Council",
  },
  {
    name: "Cavan County Council",
    code: "CAVAN",
    sourceName: "Cavan County Council",
  },
  {
    name: "Roscommon County Council",
    code: "ROSCOMMON",
    sourceName: "Roscommon County Council",
  },
  {
    name: "Westmeath County Council",
    code: "WESTMEATH",
    sourceName: "Westmeath County Council",
  },
  {
    name: "Monaghan County Council",
    code: "MONAGHAN",
    sourceName: "Monaghan County Council",
  },
  {
    name: "Sligo County Council",
    code: "SLIGO",
    sourceName: "Sligo County Council",
  },
  {
    name: "Carlow County Council",
    code: "CARLOW",
    sourceName: "Carlow County Council",
  },
  {
    name: "Longford County Council",
    code: "LONGFORD",
    sourceName: "Longford County Council",
  },
  {
    name: "Leitrim County Council",
    code: "LEITRIM",
    sourceName: "Leitrim County Council",
  },
]

const OUT_FIELDS = [
  "OBJECTID",
  "PlanningAuthority",
  "ApplicationNumber",
  "DevelopmentDescription",
  "DevelopmentAddress",
  "DevelopmentPostcode",
  "ITMEasting",
  "ITMNorthing",
  "ApplicationStatus",
  "ApplicationType",
  "ApplicantForename",
  "ApplicantSurname",
  "Decision",
  "ReceivedDate",
  "DecisionDate",
  "GrantDate",
  "AppealDecisionDate",
  "AppealSubmittedDate",
  "LinkAppDetails",
  "SiteId",
].join(",")

const supabase =
  supabaseUrl && serviceRoleKey ? createClient(supabaseUrl, serviceRoleKey) : null

function formatDate(date) {
  return date.toISOString().slice(0, 10)
}

function parseDateArg(value) {
  if (!value) return null
  const date = new Date(`${value}T00:00:00Z`)
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Invalid date: ${value}. Use YYYY-MM-DD.`)
  }
  return date
}

function parseArgs(argv) {
  const options = {
    from: null,
    to: null,
    days: DEFAULT_DAYS,
    dryRun: false,
    includeCork: false,
    storePayload: false,
    countOnly: false,
    authorities: [],
  }

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]

    if (arg === "--dry-run") {
      options.dryRun = true
    } else if (arg === "--include-cork") {
      options.includeCork = true
    } else if (arg === "--store-payload") {
      options.storePayload = true
    } else if (arg === "--count-only") {
      options.countOnly = true
    } else if (arg === "--from") {
      options.from = parseDateArg(argv[++index])
    } else if (arg === "--to") {
      options.to = parseDateArg(argv[++index])
    } else if (arg === "--days") {
      options.days = Number(argv[++index])
      if (!Number.isFinite(options.days) || options.days < 1) {
        throw new Error("--days must be a positive number")
      }
    } else if (arg === "--authority") {
      options.authorities.push(argv[++index])
    } else {
      throw new Error(`Unknown argument: ${arg}`)
    }
  }

  const today = new Date()
  today.setUTCHours(0, 0, 0, 0)
  const to = options.to ?? today
  const from = options.from ?? addDays(to, -options.days)

  if (from > to) {
    throw new Error("--from must be before --to")
  }

  return { ...options, from, to }
}

function addDays(date, days) {
  const next = new Date(date)
  next.setUTCDate(next.getUTCDate() + days)
  return next
}

function sqlString(value) {
  return String(value).replaceAll("'", "''")
}

function applicantName(row) {
  return [row.ApplicantForename, row.ApplicantSurname]
    .map(cleanNationalPlanningText)
    .filter(Boolean)
    .join(" ")
    .trim() || null
}

function mapApplication(row, authority, { storePayload }) {
  const reference = cleanNationalPlanningText(row.ApplicationNumber)
  if (!reference) return null

  return {
    local_authority: authority.name,
    local_authority_code: authority.code,
    source_application_id: Number.isInteger(row.OBJECTID) ? row.OBJECTID : null,
    reference,
    web_reference: reference,
    application_type: cleanNationalPlanningText(row.ApplicationType),
    proposal: cleanNationalPlanningText(row.DevelopmentDescription),
    location: cleanNationalPlanningText(row.DevelopmentAddress),
    ...planningEircodeFieldsFromSources(
      row.DevelopmentPostcode,
      row.DevelopmentAddress
    ),
    applicant_name: applicantName(row),
    agent_name: null,
    status: cleanNationalPlanningText(row.ApplicationStatus),
    decision_text: cleanNationalPlanningText(row.Decision),
    registration_date: parseNationalArcgisDate(row.ReceivedDate),
    valid_date: null,
    decision_date: parseNationalArcgisDate(row.DecisionDate),
    final_grant_date: parseNationalArcgisDate(row.GrantDate),
    appeal_lodged_date: parseNationalArcgisDate(row.AppealSubmittedDate),
    appeal_decision_date: parseNationalArcgisDate(row.AppealDecisionDate),
    dispatch_date: null,
    appeal_notify_date: null,
    ward: null,
    area_ids: [],
    ward_ids: [],
    parish_ids: [],
    grid_reference: null,
    grid_easting: Number.isFinite(row.ITMEasting) ? row.ITMEasting : null,
    grid_northing: Number.isFinite(row.ITMNorthing) ? row.ITMNorthing : null,
    pending_amendment: null,
    source_url: nationalPlanningSourceUrl(
      authority.code,
      reference,
      row.LinkAppDetails
    ),
    source_api_url: FEATURE_LAYER_URL,
    ...(storePayload ? { source_payload: row } : {}),
    updated_at: new Date().toISOString(),
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function fetchJson(url, label, headers = {}, { allowNotFound = false } = {}) {
  let lastError

  for (let attempt = 1; attempt <= MAX_RETRIES + 1; attempt += 1) {
    if (REQUEST_DELAY_MS > 0) await sleep(REQUEST_DELAY_MS)

    try {
      const response = await fetch(url, {
        headers: {
          "User-Agent": "OpenList national planning importer",
          ...headers,
        },
      })

      if (allowNotFound && response.status === 404) return null

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }

      const data = await response.json()
      if (data.error) {
        throw new Error(data.error.message || JSON.stringify(data.error))
      }

      return data
    } catch (error) {
      lastError = error
      if (attempt <= MAX_RETRIES) {
        const delayMs = attempt * 1500
        console.warn(`${label}: ${error.message}; retrying in ${delayMs}ms`)
        await sleep(delayMs)
      }
    }
  }

  throw lastError
}

function dateWindows(from, to, windowDays = AGILE_WINDOW_DAYS) {
  const windows = []
  let cursor = new Date(`${from}T00:00:00Z`)
  const last = new Date(`${to}T00:00:00Z`)

  while (cursor <= last) {
    const windowEnd = addDays(cursor, windowDays - 1)
    if (windowEnd > last) windowEnd.setTime(last.getTime())
    windows.push({ from: formatDate(cursor), to: formatDate(windowEnd) })
    cursor = addDays(windowEnd, 1)
  }

  return windows
}

async function fetchAgileDetailsByReference(authority, records) {
  const config = nationalAgileAuthorityConfig(authority.code)
  const candidates = records.filter((record) =>
    isNationalProposalDetailCandidate(authority.code, record.proposal)
  )
  if (!config || candidates.length === 0) return new Map()

  const datedCandidates = candidates.filter((record) => record.registration_date)
  if (datedCandidates.length === 0) return new Map()
  const wantedReferences = new Set(candidates.map((record) => record.reference))
  const dates = datedCandidates.map((record) => record.registration_date).sort()
  const searchRowsByReference = new Map()
  const headers = {
    "x-client": config.client,
    "x-product": "CITIZENPORTAL",
    "x-service": "PA",
  }

  if (authority.code === "WEXFORD") {
    for (const record of candidates) {
      const detailId = String(record.source_url || "").match(/\/application-details\/(\d+)/)?.[1]
      if (detailId) searchRowsByReference.set(record.reference, { id: Number(detailId) })
    }
  }

  const unresolvedReferences = new Set(
    [...wantedReferences].filter((reference) => !searchRowsByReference.has(reference))
  )
  for (const window of unresolvedReferences.size > 0 ? dateWindows(dates[0], dates.at(-1)) : []) {
    for (const status of AGILE_SEARCH_STATUSES) {
      const params = new URLSearchParams({
        registrationDateFrom: `${window.from}T00:00:00Z`,
        registrationDateTo: `${window.to}T23:59:59Z`,
        status,
      })
      const data = await fetchJson(
        `${AGILE_SEARCH_URL}?${params.toString()}`,
        `${authority.name} detail index ${window.from} to ${window.to} ${status}`,
        headers
      )
      for (const row of data.results || []) {
        const reference = cleanNationalPlanningText(row.reference)
        if (
          reference &&
          unresolvedReferences.has(reference) &&
          Number.isInteger(row.id) &&
          !searchRowsByReference.has(reference)
        ) {
          searchRowsByReference.set(reference, row)
        }
      }
    }
  }

  const details = new Map()
  for (const [reference, searchRow] of searchRowsByReference) {
    const detail = await fetchJson(
      `${AGILE_DETAIL_URL}/${searchRow.id}`,
      `${authority.name} ${reference} detail`,
      headers,
      { allowNotFound: true }
    )
    if (detail) details.set(reference, detail)
  }
  return details
}

async function enrichChangedNationalRecords(
  records,
  authority,
  fetchDetails = fetchAgileDetailsByReference
) {
  if (
    !records.some((record) =>
      isNationalProposalDetailCandidate(authority.code, record.proposal)
    )
  ) {
    return records
  }

  const details = await fetchDetails(authority, records)
  return records.map((record) => {
    const detail = details.get(record.reference)
    if (!detail) return record
    return {
      ...record,
      proposal: authoritativeNationalProposal(record.proposal, detail.fullProposal),
    }
  })
}

async function fetchAuthorityApplications(authority, { from, to }) {
  const rows = []
  let offset = 0

  while (true) {
    const where = [
      `PlanningAuthority = '${sqlString(authority.sourceName)}'`,
      `ReceivedDate >= DATE '${formatDate(from)}'`,
      `ReceivedDate < DATE '${formatDate(addDays(to, 1))}'`,
    ].join(" AND ")
    const params = new URLSearchParams({
      where,
      outFields: OUT_FIELDS,
      returnGeometry: "false",
      resultOffset: String(offset),
      resultRecordCount: String(DEFAULT_PAGE_SIZE),
      orderByFields: "ReceivedDate DESC, ApplicationNumber DESC",
      f: "json",
    })
    const data = await fetchJson(
      `${FEATURE_LAYER_URL}?${params.toString()}`,
      `${authority.name} offset ${offset}`
    )
    const pageRows = (data.features ?? []).map((feature) => feature.attributes ?? {})

    rows.push(...pageRows)

    if (!data.exceededTransferLimit || pageRows.length < DEFAULT_PAGE_SIZE) {
      break
    }

    offset += DEFAULT_PAGE_SIZE
  }

  return rows
}

async function fetchAuthorityApplicationCount(authority, { from, to }) {
  const where = [
    `PlanningAuthority = '${sqlString(authority.sourceName)}'`,
    `ReceivedDate >= DATE '${formatDate(from)}'`,
    `ReceivedDate < DATE '${formatDate(addDays(to, 1))}'`,
  ].join(" AND ")
  const params = new URLSearchParams({
    where,
    returnCountOnly: "true",
    f: "json",
  })
  const data = await fetchJson(
    `${FEATURE_LAYER_URL}?${params.toString()}`,
    `${authority.name} source count`
  )
  return Number(data.count || 0)
}

function chunk(items, size) {
  const chunks = []
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size))
  }
  return chunks
}

function dedupeRecords(records) {
  const recordsByKey = new Map()

  for (const record of records) {
    recordsByKey.set(`${record.local_authority_code}||${record.reference}`, record)
  }

  return Array.from(recordsByKey.values())
}

function selectedAuthorities(options) {
  const requested = new Set(options.authorities.map((value) => value.toLowerCase()))

  return AUTHORITIES.filter((authority) => {
    if (!options.includeCork && DEFAULT_EXCLUDED_CODES.has(authority.code)) {
      return false
    }

    if (requested.size === 0) return true

    return (
      requested.has(authority.code.toLowerCase()) ||
      requested.has(authority.sourceName.toLowerCase())
    )
  })
}

async function ingestNationalPlanningApplications(options) {
  if (!supabase) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY")
  }
  const authorities = selectedAuthorities(options)
  const summary = []

  console.log(
    `National planning ${options.dryRun ? "dry run" : "import"} from ${formatDate(
      options.from
    )} to ${formatDate(options.to)} for ${authorities.length} authorities.`
  )
  console.log(
    `source_payload storage: ${options.storePayload ? "enabled" : "disabled"}`
  )

  for (const authority of authorities) {
    if (options.countOnly) {
      const rows = await fetchAuthorityApplicationCount(authority, options)
      summary.push({ authority: authority.name, rows })
      console.log(`${authority.name}: ${rows} official source rows`)
      continue
    }

    const sourceRows = await fetchAuthorityApplications(authority, options)
    const mappedRecords = sourceRows
      .map((row) => mapApplication(row, authority, options))
      .filter(Boolean)
    const records = dedupeRecords(mappedRecords)
    summary.push({ authority: authority.name, rows: records.length })

    console.log(
      `${authority.name}: fetched ${sourceRows.length}, mapped ${mappedRecords.length}, unique ${records.length}`
    )

    if (options.dryRun || records.length === 0) continue

    const { changedRecords, unchangedCount } = await filterChangedPlanningRecords(
      supabase,
      records,
      {
        authorityCode: authority.code,
        from: formatDate(options.from),
        to: formatDate(options.to),
      }
    )

    const enrichedChangedRecords = await enrichChangedNationalRecords(
      changedRecords,
      authority
    )

    let processed = 0
    for (const batch of chunk(enrichedChangedRecords, 100)) {
      try {
        await upsertPlanningBatch(supabase, batch, authority.name)
      } catch (error) {
        throw new Error(
          `${authority.name} upsert failed after ${processed}/${enrichedChangedRecords.length} changed rows`,
          { cause: error }
        )
      }

      processed += batch.length
    }

    console.log(
      `${authority.name}: upserted ${processed} changed/new rows; skipped ${unchangedCount} unchanged rows`
    )
  }

  console.log(JSON.stringify({ from: formatDate(options.from), to: formatDate(options.to), summary }, null, 2))
}

const isDirectRun = import.meta.url === `file://${process.argv[1]}`

if (isDirectRun) {
  const options = parseArgs(process.argv.slice(2))
  ingestNationalPlanningApplications(options).catch((error) => {
    console.error(formatErrorForLog(error))
    process.exit(1)
  })
}

export {
  AUTHORITIES,
  enrichChangedNationalRecords,
  fetchAgileDetailsByReference,
  fetchAuthorityApplicationCount,
  ingestNationalPlanningApplications,
  parseArgs,
}
