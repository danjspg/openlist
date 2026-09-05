import { createClient } from "@supabase/supabase-js"
import {
  EPLAN_AUTHORITIES,
  normaliseReference,
  parseIrishDate,
} from "../lib/eplan-planning-source.mjs"
import { planningEircodeFieldsFromSources } from "../lib/eircode-ingestion.mjs"

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const authorityCode = String(process.env.EPLAN_HISTORICAL_AUTHORITY || process.argv[2] || "KILDARE").toUpperCase()
const dryRun = process.env.EPLAN_HISTORICAL_DRY_RUN === "1"
const forceFullScan = process.env.EPLAN_HISTORICAL_FULL_SCAN === "1" || authorityCode === "MEATH"
const REQUEST_DELAY_MS = Math.max(250, Number(process.env.EPLAN_HISTORICAL_DELAY_MS || 450))
const CHECKPOINT_EVERY = 25
const STAGE_BATCH_SIZE = 200
const UA = "OpenList historical planning coverage backfill (+https://www.openlist.ie)"

const AUTHORITY_NAMES = {
  CARLOW: "Carlow County Council",
  CAVAN: "Cavan County Council",
  CLARE: "Clare County Council",
  DONEGAL: "Donegal County Council",
  GALWAYCOCO: "Galway County Council",
  GALWAYCITY: "Galway City Council",
  KILDARE: "Kildare County Council",
  KILKENNY: "Kilkenny County Council",
  KERRY: "Kerry County Council",
  LAOIS: "Laois County Council",
  LIMERICK: "Limerick City and County Council",
  LEITRIM: "Leitrim County Council",
  LONGFORD: "Longford County Council",
  LOUTH: "Louth County Council",
  MAYO: "Mayo County Council",
  MEATH: "Meath County Council",
  MONAGHAN: "Monaghan County Council",
  WATERFORD: "Waterford City and County Council",
  OFFALY: "Offaly County Council",
  ROSCOMMON: "Roscommon County Council",
  SLIGO: "Sligo County Council",
  TIPPERARY: "Tipperary County Council",
  WESTMEATH: "Westmeath County Council",
  WICKLOW: "Wicklow County Council",
}

const config = EPLAN_AUTHORITIES[authorityCode]
if (!config) throw new Error(`Unsupported ePlan authority: ${authorityCode}`)
if (!dryRun && (!supabaseUrl || !serviceRoleKey)) throw new Error("Missing Supabase credentials")
const supabase = !dryRun
  ? createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } })
  : null
const baseUrl = `https://www.eplanning.ie/${config.path}`

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

function decodeHtml(value) {
  return String(value || "")
    .replace(/<br\s*\/?\s*>/gi, " | ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, decimal) => String.fromCodePoint(Number(decimal)))
    .replace(/\s*\|\s*/g, " | ")
    .replace(/\s+/g, " ")
    .trim()
}

function inputValue(html, name) {
  for (const match of String(html).matchAll(/<input\b[^>]*>/gi)) {
    const tag = match[0]
    const attrs = Object.fromEntries(
      [...tag.matchAll(/([:\w-]+)\s*=\s*["']([^"']*)["']/g)].map((m) => [m[1], m[2]])
    )
    if (attrs.name === name) return attrs.value || ""
  }
  return ""
}

function tableRows(html) {
  return [...String(html).matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)]
    .map((row) =>
      [...row[1].matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((cell) => decodeHtml(cell[1]))
    )
    .filter((row) => row.length >= 10 && row[0] !== "File Number")
}

function pageMeta(html) {
  const match = decodeHtml(html).match(/Page\s+(\d+)\s+of\s+(\d+)\s+\((\d+) Applications\)/i)
  if (!match) throw new Error("Could not parse ePlan result page metadata")
  return { page: Number(match[1]), totalPages: Number(match[2]), totalApplications: Number(match[3]) }
}

function yearOfIso(value) {
  return value ? Number(value.slice(0, 4)) : null
}

function mapRow(row) {
  const reference = normaliseReference(row[0])
  const registrationDate = parseIrishDate(row[5])
  const year = yearOfIso(registrationDate)
  if (!reference || !registrationDate || year < 2012 || year > 2016) return null
  const location = row[7] || null
  return {
    local_authority: AUTHORITY_NAMES[authorityCode],
    local_authority_code: authorityCode,
    source_application_id: null,
    reference,
    web_reference: reference,
    application_type: null,
    proposal: row[8] || null,
    location,
    ...planningEircodeFieldsFromSources(null, location),
    applicant_name: row[6] || null,
    status: row[1] || null,
    decision_text: row[4] || null,
    registration_date: registrationDate,
    decision_date: parseIrishDate(row[3]),
    decision_due_date: parseIrishDate(row[2]),
    final_grant_date: null,
    expiry_date: null,
    further_information_requested_date: null,
    further_information_received_date: null,
    withdrawal_date: null,
    appeal_lodged_date: null,
    appeal_decision_date: null,
    grid_easting: null,
    grid_northing: null,
    source_url: `${baseUrl}/AppFileRefDetails/${encodeURIComponent(reference)}/0`,
    source_api_url: null,
    registration_year: year,
  }
}

class CookieJar {
  constructor() { this.values = new Map() }
  absorb(headers) {
    const raw = typeof headers.getSetCookie === "function"
      ? headers.getSetCookie()
      : [headers.get("set-cookie")].filter(Boolean)
    for (const cookie of raw) {
      const pair = String(cookie).split(";")[0]
      const index = pair.indexOf("=")
      if (index > 0) this.values.set(pair.slice(0, index), pair.slice(index + 1))
    }
  }
  header() { return [...this.values].map(([name, value]) => `${name}=${value}`).join("; ") }
}

async function fetchWithRetry(url, options = {}, label = url) {
  let lastError
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    await sleep(REQUEST_DELAY_MS)
    try {
      const response = await fetch(url, { ...options, signal: AbortSignal.timeout(45000) })
      if (response.ok) return response
      lastError = new Error(`${label}: HTTP ${response.status}`)
      if (![408, 425, 429, 500, 502, 503, 504].includes(response.status)) break
    } catch (error) {
      lastError = error
    }
    await sleep(attempt * 1500)
  }
  throw lastError || new Error(`${label}: fetch failed`)
}

async function establishSearch() {
  const jar = new CookieJar()
  const landing = await fetchWithRetry(`${baseUrl}/SearchExact`, { headers: { "User-Agent": UA } }, `${authorityCode} search landing`)
  jar.absorb(landing.headers)
  const html = await landing.text()
  const tokens = [...html.matchAll(/name=["']__RequestVerificationToken["'][^>]*value=["']([^"']+)/gi)].map((m) => m[1])
  const token = tokens.at(-1)
  if (!token) throw new Error(`${authorityCode}: detailed search token missing`)
  const siteName = inputValue(html, "CheckBoxList[0].Name") || AUTHORITY_NAMES[authorityCode]
  const siteNames = inputValue(html, "CountyTownCouncilNames") || `${siteName}:0,`
  const form = new URLSearchParams()
  for (const [name, value] of [
    ["__RequestVerificationToken", token], ["TxtFileNumber", ""], ["TxtName", ""],
    ["TxtAddress", ""], ["TxtDevdescription", ""], ["CheckBoxList[0].Id", "0"],
    ["CheckBoxList[0].Name", siteName], ["CheckBoxList[0].IsSelected", "true"],
    ["CheckBoxList[0].IsSelected", "false"], ["LstTimeLimit", "0"], ["SearchType", "Exact"],
    ["CountyTownCount", "1"], ["CountyTownCouncilNames", siteNames],
  ]) form.append(name, value)
  const result = await fetchWithRetry(`${baseUrl}/searchresults`, {
    method: "POST",
    headers: {
      "User-Agent": UA,
      "Content-Type": "application/x-www-form-urlencoded",
      Referer: `${baseUrl}/SearchExact`,
      Cookie: jar.header(),
    },
    body: form,
  }, `${authorityCode} unrestricted search`)
  jar.absorb(result.headers)
  const resultHtml = await result.text()
  return { jar, firstHtml: resultHtml, meta: pageMeta(resultHtml) }
}

async function pageHtml(session, page) {
  if (page === 1) return session.firstHtml
  const response = await fetchWithRetry(`${baseUrl}/searchresults/Default/${page}`, {
    headers: { "User-Agent": UA, Referer: `${baseUrl}/searchresults`, Cookie: session.jar.header() },
  }, `${authorityCode} page ${page}`)
  session.jar.absorb(response.headers)
  const html = await response.text()
  const meta = pageMeta(html)
  if (meta.page !== page) throw new Error(`${authorityCode}: requested page ${page}, received page ${meta.page}`)
  return html
}

function rawCompare(a, b) {
  const left = normaliseReference(a)
  const right = normaliseReference(b)
  return left < right ? -1 : left > right ? 1 : 0
}

async function lowerBoundPage(session, target) {
  let low = 1
  let high = session.meta.totalPages
  let answer = high
  while (low <= high) {
    const mid = Math.floor((low + high) / 2)
    const rows = tableRows(await pageHtml(session, mid))
    if (!rows.length) throw new Error(`${authorityCode}: page ${mid} contained no application rows`)
    const lastReference = rows.at(-1)[0]
    if (rawCompare(lastReference, target) >= 0) {
      answer = mid
      high = mid - 1
    } else {
      low = mid + 1
    }
  }
  return answer
}

async function stageRows(rows) {
  if (dryRun || !rows.length) return
  const { error } = await supabase.from("planning_historical_import_stage").upsert(rows, {
    onConflict: "local_authority_code,reference",
    ignoreDuplicates: true,
  })
  if (error) throw error
}

async function progressRow() {
  if (dryRun) return null
  const { data, error } = await supabase.from("planning_historical_eplan_progress")
    .select("*").eq("local_authority_code", authorityCode).maybeSingle()
  if (error) throw error
  return data
}

async function saveProgress(values) {
  if (dryRun) return
  const { error } = await supabase.from("planning_historical_eplan_progress").upsert({
    local_authority_code: authorityCode,
    portal_path: config.path,
    updated_at: new Date().toISOString(),
    ...values,
  }, { onConflict: "local_authority_code" })
  if (error) throw error
}

async function main() {
  const existing = await progressRow()
  if (existing?.status === "complete") {
    console.log(JSON.stringify({ authorityCode, skipped: "already_complete", stagedRows: existing.staged_rows }))
    return
  }

  await saveProgress({ status: "discovering", last_error: null })
  const session = await establishSearch()
  console.log(JSON.stringify({ authorityCode, ...session.meta, fullScan: forceFullScan }))

  let startPage
  let endPage
  if (forceFullScan) {
    startPage = 1
    endPage = session.meta.totalPages
  } else if (existing?.start_page && existing?.end_page) {
    startPage = existing.start_page
    endPage = existing.end_page
  } else {
    startPage = await lowerBoundPage(session, "12")
    endPage = await lowerBoundPage(session, "17")
  }

  const resumePage = existing?.next_page && existing.next_page >= startPage && existing.next_page <= endPage
    ? existing.next_page
    : startPage
  console.log(JSON.stringify({ authorityCode, startPage, endPage, resumePage, pagesToInspect: endPage - resumePage + 1 }))

  if (dryRun) {
    for (const page of [...new Set([startPage, Math.min(endPage, startPage + 1), endPage])]) {
      const rows = tableRows(await pageHtml(session, page))
      console.log(JSON.stringify({ authorityCode, samplePage: page, rows: rows.slice(0, 10) }))
    }
    return
  }

  await saveProgress({
    total_pages: session.meta.totalPages,
    total_applications: session.meta.totalApplications,
    start_page: startPage,
    end_page: endPage,
    next_page: resumePage,
    staged_rows: existing?.staged_rows || 0,
    status: "harvesting",
  })

  let stagedRows = Number(existing?.staged_rows || 0)
  let buffer = []
  for (let page = resumePage; page <= endPage; page += 1) {
    const rows = tableRows(await pageHtml(session, page))
    for (const row of rows) {
      const mapped = mapRow(row)
      if (mapped) buffer.push(mapped)
    }
    if (buffer.length >= STAGE_BATCH_SIZE || page === endPage) {
      await stageRows(buffer)
      stagedRows += buffer.length
      buffer = []
    }
    if ((page - resumePage + 1) % CHECKPOINT_EVERY === 0 || page === endPage) {
      await saveProgress({
        total_pages: session.meta.totalPages,
        total_applications: session.meta.totalApplications,
        start_page: startPage,
        end_page: endPage,
        next_page: page + 1,
        staged_rows: stagedRows,
        status: page === endPage ? "complete" : "harvesting",
        last_error: null,
      })
      console.log(JSON.stringify({ authorityCode, page, endPage, stagedRows }))
    }
  }
  console.log(JSON.stringify({ authorityCode, complete: true, stagedRows }))
}

main().catch(async (error) => {
  console.error(error)
  try { await saveProgress({ status: "failed", last_error: String(error?.message || error).slice(0, 1000) }) } catch {}
  process.exit(1)
})
