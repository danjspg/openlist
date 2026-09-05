import fs from "node:fs"
import readline from "node:readline"
import { createClient } from "@supabase/supabase-js"

const INPUT = process.argv[2] || ".tmp/planning-authority-archives-2012-2016.ndjson"
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!supabaseUrl || !serviceRoleKey) throw new Error("Missing Supabase credentials")
const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } })
const STAGE_BATCH = 250
const MIN_IMPORT_BATCH = 10
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

function clean(value) {
  const text = String(value ?? "").replace(/\s+/g," ").trim()
  return !text || /^(?:n\\?a|n\/a|null|none)$/i.test(text) ? null : text
}
const numeric = (value) => Number.isFinite(Number(value)) ? Number(value) : null
const integer = (value) => Number.isSafeInteger(Number(value)) ? Number(value) : null
function dateValue(value) {
  if (value === null || value === undefined || value === "") return null
  if (typeof value === "number" || /^\d{12,13}$/.test(String(value).trim())) {
    const parsed = new Date(Number(value)); return Number.isNaN(parsed.valueOf()) ? null : parsed.toISOString().slice(0,10)
  }
  const raw = String(value).trim(), dmy = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (dmy) return `${dmy[3]}-${dmy[2].padStart(2,"0")}-${dmy[1].padStart(2,"0")}`
  const parsed = Date.parse(raw); return Number.isNaN(parsed) ? null : new Date(parsed).toISOString().slice(0,10)
}
function eplanUrl(source, reference, attrs) {
  if (source.kind === "galway") return clean(attrs.MoreInfo) || `https://www.eplanning.ie/GalwayCC/AppFileRefDetails/${encodeURIComponent(reference)}/0`
  return `https://www.eplanning.ie/KildareCC/AppFileRefDetails/${encodeURIComponent(reference)}/0`
}
function mapRow(source, feature) {
  const a = feature.attributes || {}, g = feature.geometry || {}
  if (source.kind === "kildare") {
    const reference = clean(a.File_Number), registrationDate = dateValue(a.Received_Date), year = Number(registrationDate?.slice(0,4) || a.Year)
    if (!reference || !registrationDate || year < 2012 || year > 2016) return null
    return { local_authority:source.authority, local_authority_code:source.code, source_application_id:integer(a.OBJECTID), reference, web_reference:reference, application_type:clean(a.Application_Type), proposal:clean(a.Description), location:clean(a.Full_Address), eircode:null, eircode_prefix:null, applicant_name:[clean(a.Forename),clean(a.Surname)].filter(Boolean).join(" ")||null, status:clean(a.Status), decision_text:clean(a.Decision), registration_date:registrationDate, decision_date:dateValue(a.Decision_Date), decision_due_date:dateValue(a.Decision_Due_Date), final_grant_date:dateValue(a.Grant_Date), expiry_date:dateValue(a.Expiry_Date), further_information_requested_date:null, further_information_received_date:null, withdrawal_date:dateValue(a.Withdrawn_Date), appeal_lodged_date:null, appeal_decision_date:null, grid_easting:numeric(g.x), grid_northing:numeric(g.y), source_url:eplanUrl(source,reference,a), source_api_url:source.base, registration_year:year }
  }
  const reference = clean(a.ApplicationNumber), registrationDate = dateValue(a.ReceivedDate), year = Number(registrationDate?.slice(0,4))
  if (!reference || !registrationDate || year < 2012 || year > 2016) return null
  return { local_authority:source.authority, local_authority_code:source.code, source_application_id:integer(a.OBJECTID), reference, web_reference:reference, application_type:clean(a.ApplicationType), proposal:clean(a.Description), location:clean(a.Location), eircode:null, eircode_prefix:null, applicant_name:clean(a.ApplicantName), status:clean(a.ApplicationStatus), decision_text:clean(a.Decision), registration_date:registrationDate, decision_date:dateValue(a.DecisionDate), decision_due_date:dateValue(a.DecisionDueDate), final_grant_date:dateValue(a.GrantDate), expiry_date:dateValue(a.ExpiryDate), further_information_requested_date:null, further_information_received_date:null, withdrawal_date:dateValue(a.WithdrawnDate), appeal_lodged_date:dateValue(a.AppealNotificationDate), appeal_decision_date:dateValue(a.AppealDecisionDate), grid_easting:numeric(a.ITMEasting ?? g.x), grid_northing:numeric(a.ITMNorthing ?? g.y), source_url:eplanUrl(source,reference,a), source_api_url:source.base, registration_year:year }
}
async function stage(rows) {
  if (!rows.length) return
  for (let attempt = 1; attempt <= 6; attempt += 1) {
    const { error } = await supabase.from("planning_historical_import_stage").upsert(rows, { onConflict:"local_authority_code,reference", ignoreDuplicates:true })
    if (!error) return
    if (!retryable(error) || attempt === 6) throw error
    console.warn(JSON.stringify({ phase:"stage_retry", attempt, code:error.code || null, message:error.message || String(error) }))
    await sleep(Math.min(10000, attempt * 1500))
  }
}
function retryable(error) { return ["57014","57P01","53300","08000","08001","08003","08006"].includes(error?.code) || /timeout|fetch failed|temporar|connection/i.test(error?.message || "") || !error?.message }
async function drain() {
  let batchSize=25, insertedTotal=0, consecutiveFailures=0
  for (;;) {
    let data, error
    try {
      const result = await supabase.rpc("openlist_import_historical_planning_batch", { p_limit:batchSize })
      data = result.data
      error = result.error
    } catch (thrown) {
      error = thrown
    }
    if (error) {
      if (!retryable(error)) throw error
      consecutiveFailures += 1
      if (batchSize > MIN_IMPORT_BATCH) batchSize = Math.max(MIN_IMPORT_BATCH, Math.floor(batchSize / 2))
      if (consecutiveFailures > 12) throw error
      console.warn(JSON.stringify({ phase:"retry", code:error?.code || null, message:error?.message || String(error), nextBatchSize:batchSize, consecutiveFailures }))
      await sleep(Math.min(15000, 1500 * consecutiveFailures))
      continue
    }
    consecutiveFailures = 0
    const result=data?.[0]; if (!result) throw new Error("Historical import RPC returned no result")
    insertedTotal += Number(result.inserted || 0)
    console.log(JSON.stringify({ phase:"import", batchSize, ...result, insertedTotal }))
    if (Number(result.remaining || 0) === 0) return insertedTotal
    await sleep(750)
  }
}

let buffer=[], mapped=0, skipped=0
const lines=readline.createInterface({ input:fs.createReadStream(INPUT), crlfDelay:Infinity })
for await (const line of lines) {
  if (!line.trim()) continue
  const item=JSON.parse(line), row=mapRow(item.source,item.feature)
  if (!row) { skipped+=1; continue }
  buffer.push(row); mapped+=1
  if (buffer.length >= STAGE_BATCH) { await stage(buffer); buffer=[] }
}
await stage(buffer)
console.log(JSON.stringify({ phase:"staged", mapped, skipped }))
const inserted=await drain()
console.log(JSON.stringify({ phase:"complete", mapped, skipped, insertedThisRun:inserted }))
