import { createClient } from "@supabase/supabase-js"
import { planningEircodeFieldsFromSources } from "../lib/eircode-ingestion.mjs"
import {
  cleanNationalPlanningText,
  nationalPlanningSourceUrl,
} from "../lib/national-planning-source.mjs"

const CSV_URL = "https://data-housinggovie.opendata.arcgis.com/api/download/v1/items/8f69dffe26324ba3acc653cf6cb5cf8b/csv?layers=0"
const SOURCE_API_URL = "https://services.arcgis.com/NzlPQPKn5QF9v2US/ArcGIS/rest/services/IrishPlanningApplications/FeatureServer/0/query"
const STAGE_BATCH = 500
const INITIAL_IMPORT_BATCH = 1000
const MIN_IMPORT_BATCH = 100

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!supabaseUrl || !serviceRoleKey) throw new Error("Missing Supabase credentials")
const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } })

const AUTHORITIES = [
  ["CORKCOCO", "Cork County Council"], ["CORKCITY", "Cork City Council"],
  ["DUBLINCITY", "Dublin City Council"], ["FINGAL", "Fingal County Council"],
  ["SOUTHDUBLIN", "South Dublin County Council"], ["DLR", "Dun Laoghaire Rathdown County Council"],
  ["KILDARE", "Kildare County Council"], ["GALWAYCOCO", "Galway County Council"],
  ["GALWAYCITY", "Galway City Council"], ["MEATH", "Meath County Council"],
  ["WICKLOW", "Wicklow County Council"], ["LIMERICK", "Limerick City and County Council"],
  ["WATERFORD", "Waterford City and County Council"], ["DONEGAL", "Donegal County Council"],
  ["WEXFORD", "Wexford County Council"], ["TIPPERARY", "Tipperary County Council"],
  ["KERRY", "Kerry County Council"], ["MAYO", "Mayo County Council"],
  ["CLARE", "Clare County Council"], ["LOUTH", "Louth County Council"],
  ["LAOIS", "Laois County Council"], ["KILKENNY", "Kilkenny County Council"],
  ["OFFALY", "Offaly County Council"], ["CAVAN", "Cavan County Council"],
  ["ROSCOMMON", "Roscommon County Council"], ["WESTMEATH", "Westmeath County Council"],
  ["MONAGHAN", "Monaghan County Council"], ["SLIGO", "Sligo County Council"],
  ["CARLOW", "Carlow County Council"], ["LONGFORD", "Longford County Council"],
  ["LEITRIM", "Leitrim County Council"],
]

function key(value) {
  return String(value || "").toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "")
}
const authorityByName = new Map()
for (const [code, name] of AUTHORITIES) authorityByName.set(key(name), { code, name })
for (const [alias, code] of [
  ["Dun Laoghaire-Rathdown County Council", "DLR"],
  ["Limerick County Council", "LIMERICK"],
  ["Limerick City & County Council", "LIMERICK"],
  ["Waterford County Council", "WATERFORD"],
]) {
  const match = AUTHORITIES.find(([candidate]) => candidate === code)
  authorityByName.set(key(alias), { code, name: match[1] })
}

function *parseCsv(text) {
  let row = [], value = "", quoted = false
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i], next = text[i + 1]
    if (ch === '"' && quoted && next === '"') { value += '"'; i += 1; continue }
    if (ch === '"') { quoted = !quoted; continue }
    if (ch === "," && !quoted) { row.push(value); value = ""; continue }
    if ((ch === "\n" || ch === "\r") && !quoted) {
      if (ch === "\r" && next === "\n") i += 1
      row.push(value)
      if (row.some((v) => v.length)) yield row
      row = []; value = ""; continue
    }
    value += ch
  }
  row.push(value)
  if (row.some((v) => v.length)) yield row
}

function nullable(value) {
  const cleaned = cleanNationalPlanningText(value)
  return cleaned || null
}
function dateValue(value) {
  const raw = String(value || "").trim()
  if (!raw) return null
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10)
  if (/^\d{13}$/.test(raw)) return new Date(Number(raw)).toISOString().slice(0, 10)
  const parsed = Date.parse(raw)
  return Number.isNaN(parsed) ? null : new Date(parsed).toISOString().slice(0, 10)
}
function numberValue(value) {
  const parsed = Number(String(value || "").replaceAll(",", "").trim())
  return Number.isFinite(parsed) ? parsed : null
}
function integerValue(value) {
  const parsed = Number(String(value || "").trim())
  return Number.isSafeInteger(parsed) ? parsed : null
}
function recordFrom(headers, row) {
  return Object.fromEntries(headers.map((header, i) => [header, row[i] ?? ""]))
}
function field(record, ...names) {
  for (const name of names) if (record[name] !== undefined) return record[name]
  return ""
}
function mapRecord(record) {
  const authority = authorityByName.get(key(field(record, "PlanningAuthority", "Planning Authority")))
  const reference = nullable(field(record, "ApplicationNumber", "Application Number"))
  const registrationDate = dateValue(field(record, "ReceivedDate", "Received Date"))
  if (!authority || !reference || !registrationDate) return null
  const year = Number(registrationDate.slice(0, 4))
  if (year < 2012 || year > 2016) return null
  const location = nullable(field(record, "DevelopmentAddress", "Development Address"))
  const rawEircode = field(record, "DevelopmentPostcode", "Development Postcode")
  const eircode = planningEircodeFieldsFromSources(rawEircode, location)
  const applicantName = [field(record, "ApplicantForename", "Applicant Forename"), field(record, "ApplicantSurname", "Applicant Surname")]
    .map(nullable).filter(Boolean).join(" ") || null
  const sourceLink = nullable(field(record, "LinkAppDetails", "Link App Details"))
  return {
    local_authority: authority.name,
    local_authority_code: authority.code,
    source_application_id: integerValue(field(record, "OBJECTID", "ObjectId", "ObjectID")),
    reference,
    web_reference: reference,
    application_type: nullable(field(record, "ApplicationType", "Application Type")),
    proposal: nullable(field(record, "DevelopmentDescription", "Development Description")),
    location,
    ...eircode,
    applicant_name: applicantName,
    status: nullable(field(record, "ApplicationStatus", "Application Status")),
    decision_text: nullable(field(record, "Decision")),
    registration_date: registrationDate,
    decision_date: dateValue(field(record, "DecisionDate", "Decision Date")),
    decision_due_date: dateValue(field(record, "DecisionDueDate", "Decision Due Date")),
    final_grant_date: dateValue(field(record, "GrantDate", "Grant Date")),
    expiry_date: dateValue(field(record, "ExpiryDate", "Expiry Date")),
    further_information_requested_date: dateValue(field(record, "FIRequestDate", "FI Request Date")),
    further_information_received_date: dateValue(field(record, "FIRecDate", "FI Rec Date")),
    withdrawal_date: dateValue(field(record, "WithdrawnDate", "Withdrawn Date")),
    appeal_lodged_date: dateValue(field(record, "AppealSubmittedDate", "Appeal Submitted Date")),
    appeal_decision_date: dateValue(field(record, "AppealDecisionDate", "Appeal Decision Date")),
    grid_easting: numberValue(field(record, "ITMEasting", "ITM Easting")),
    grid_northing: numberValue(field(record, "ITMNorthing", "ITM Northing")),
    source_url: nationalPlanningSourceUrl(authority.code, reference, sourceLink),
    source_api_url: SOURCE_API_URL,
    registration_year: year,
  }
}

async function stage(rows) {
  if (!rows.length) return
  const { error } = await supabase.from("planning_historical_import_stage").upsert(rows, {
    onConflict: "local_authority_code,reference",
    ignoreDuplicates: true,
  })
  if (error) throw error
}
function retryable(error) {
  return ["57014", "57P01", "53300", "08000", "08001", "08003", "08006"].includes(error?.code) || /timeout|fetch failed|temporar|connection/i.test(error?.message || "")
}
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function drain() {
  let batchSize = INITIAL_IMPORT_BATCH
  let insertedTotal = 0
  for (;;) {
    const { data, error } = await supabase.rpc("openlist_import_historical_planning_batch", { p_limit: batchSize })
    if (error) {
      if (retryable(error) && batchSize > MIN_IMPORT_BATCH) {
        batchSize = Math.max(MIN_IMPORT_BATCH, Math.floor(batchSize / 2))
        console.warn(`Import pressure detected; reducing batch to ${batchSize}`, error.code || error.message)
        await sleep(1500)
        continue
      }
      throw error
    }
    const result = data?.[0]
    if (!result) throw new Error("Historical import RPC returned no result")
    insertedTotal += Number(result.inserted || 0)
    console.log(JSON.stringify({ phase: "import", batchSize, ...result, insertedTotal }))
    if (Number(result.remaining || 0) === 0) return insertedTotal
    await sleep(250)
  }
}

async function countHistorical() {
  const { count, error } = await supabase.from("planning_applications")
    .select("id", { count: "exact", head: true })
    .gte("registration_date", "2012-01-01").lte("registration_date", "2016-12-31")
  if (error) throw error
  return count || 0
}

async function main() {
  const before = await countHistorical()
  console.log(`Historical applications before: ${before}`)
  const response = await fetch(CSV_URL, { headers: { "User-Agent": "OpenList historical coverage backfill" } })
  if (!response.ok) throw new Error(`Official CSV download failed: HTTP ${response.status}`)
  const text = await response.text()
  const iterator = parseCsv(text)
  const first = iterator.next()
  if (first.done) throw new Error("Official CSV was empty")
  const headers = first.value.map((value) => value.replace(/^\uFEFF/, "").trim())
  console.log(`CSV headers: ${headers.join(",")}`)

  let candidates = 0, unmappedAuthorities = new Map(), buffer = []
  for (const row of iterator) {
    const record = recordFrom(headers, row)
    const registrationDate = dateValue(field(record, "ReceivedDate", "Received Date"))
    const year = registrationDate ? Number(registrationDate.slice(0, 4)) : 0
    if (year < 2012 || year > 2016) continue
    const mapped = mapRecord(record)
    if (!mapped) {
      const authority = String(field(record, "PlanningAuthority", "Planning Authority") || "<blank>")
      unmappedAuthorities.set(authority, (unmappedAuthorities.get(authority) || 0) + 1)
      continue
    }
    candidates += 1
    buffer.push(mapped)
    if (buffer.length >= STAGE_BATCH) {
      await stage(buffer)
      if (candidates % 10000 < STAGE_BATCH) console.log(`Staged ${candidates} source candidates`)
      buffer = []
    }
  }
  await stage(buffer)
  if (unmappedAuthorities.size) console.warn("Unmapped historical authorities", Object.fromEntries(unmappedAuthorities))

  const { count: staged, error: stageCountError } = await supabase.from("planning_historical_import_stage")
    .select("id", { count: "exact", head: true })
  if (stageCountError) throw stageCountError
  console.log(JSON.stringify({ phase: "staged", sourceCandidates: candidates, stagedRows: staged }))

  const inserted = await drain()
  const after = await countHistorical()
  console.log(JSON.stringify({ phase: "complete", before, after, netAdded: after - before, insertedThisRun: inserted, sourceCandidates: candidates }))
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
