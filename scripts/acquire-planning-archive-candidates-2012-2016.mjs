import fs from "node:fs"

const OUTPUT = process.argv[2] || ".tmp/planning-archive-candidates-2012-2016.ndjson"
const PAGE_SIZE = 1000
const YEARS = [2012, 2013, 2014, 2015, 2016]
const COMMON_DATES = ["received_d", "RecievedDate", "ReceivedDate", "Received_Date", "DateReceived", "DATE_RECEIVED", "RECEIVED", "REC_DATE", "RECDATE", "AppDate", "APPDATE", "ApplicationDate", "Application_Date", "DATE", "Date"]
const SOURCES = [
  {
    code: "DONEGAL",
    authority: "Donegal County Council",
    base: "https://services2.arcgis.com/WRtfelnPg3R7bCEW/ArcGIS/rest/services/Applications_since_2010_Pro/FeatureServer/0",
    dateCandidates: COMMON_DATES,
  },
  {
    code: "MEATH",
    authority: "Meath County Council",
    base: "https://services-eu1.arcgis.com/33tCl0taHHdVAN9O/arcgis/rest/services/DM_PACE_PlanningApplicationPublic/FeatureServer/1",
    dateCandidates: COMMON_DATES,
  },
  {
    code: "ROSCOMMON",
    authority: "Roscommon County Council",
    base: "https://services1.arcgis.com/0g8o874l5un2eDgz/arcgis/rest/services/Planning_Finder_App_Planning_Points_Historical/FeatureServer",
    dateCandidates: COMMON_DATES,
  },
  {
    code: "WESTMEATH",
    authority: "Westmeath County Council",
    base: "https://services-eu1.arcgis.com/DsXSaNAVVnwb89Pt/arcgis/rest/services/HistoricPlanningRegisterSites/FeatureServer",
    dateCandidates: COMMON_DATES,
  },
  {
    code: "WICKLOW",
    authority: "Wicklow County Council",
    base: "https://services.arcgis.com/hQOfkHGHCu8mgDpG/arcgis/rest/services/External_Planning_Apps/FeatureServer",
    dateCandidates: COMMON_DATES,
  },
  {
    code: "CLARE",
    authority: "Clare County Council",
    base: "https://services8.arcgis.com/OnLILyV2xWhWjtPS/arcgis/rest/services/Planning_Applications_WFL1/FeatureServer",
    dateCandidates: COMMON_DATES,
  },
]

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function json(url) {
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: { "User-Agent": "OpenList historical archive acquisition" },
        signal: AbortSignal.timeout(30000),
      })
      const body = await response.json()
      if (!response.ok || body.error) throw new Error(`ArcGIS ${response.status}: ${JSON.stringify(body.error || body).slice(0, 500)}`)
      return body
    } catch (error) {
      if (attempt === 4) throw error
      await sleep(attempt * 1000)
    }
  }
}

async function resolveLayer(base) {
  if (/\/FeatureServer\/\d+$/.test(base)) return base
  const service = await json(`${base}?f=json`)
  const candidates = [...(service.layers || []), ...(service.tables || [])]
  if (!candidates.length) throw new Error(`No layers found for ${base}`)
  const preferred = candidates.find((layer) => /planning|application|historic|register|point|site/i.test(layer.name || "")) || candidates[0]
  return `${base}/${preferred.id}`
}

function pickDateField(meta, source) {
  const fields = meta.fields || []
  const exact = new Map(fields.map((field) => [field.name.toLowerCase(), field]))
  for (const candidate of source.dateCandidates) {
    const field = exact.get(candidate.toLowerCase())
    if (field) return field
  }
  return fields.find((field) => /(receiv|reciev|lodg|valid|app.*date|date.*app|reg.*date|date.*reg)/i.test(field.name)) || null
}

function yearWhere(field, year) {
  if (field.type === "esriFieldTypeDate") {
    return `${field.name} >= DATE '${year}-01-01' AND ${field.name} < DATE '${year + 1}-01-01'`
  }
  return `${field.name} LIKE '%${year}%'`
}

async function countFor(base, where) {
  const url = new URL(`${base}/query`)
  url.searchParams.set("where", where)
  url.searchParams.set("returnCountOnly", "true")
  url.searchParams.set("f", "json")
  const body = await json(url)
  return Number(body.count || 0)
}

async function featuresFor(base, where) {
  const all = []
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const url = new URL(`${base}/query`)
    for (const [key, value] of Object.entries({
      where,
      outFields: "*",
      returnGeometry: "true",
      outSR: "2157",
      resultOffset: String(offset),
      resultRecordCount: String(PAGE_SIZE),
      f: "json",
    })) url.searchParams.set(key, value)
    const body = await json(url)
    const page = body.features || []
    all.push(...page)
    if (page.length < PAGE_SIZE) break
    await sleep(150)
  }
  return all
}

fs.mkdirSync(new URL(".", `file://${process.cwd()}/${OUTPUT}`).pathname, { recursive: true })
const stream = fs.createWriteStream(OUTPUT, { encoding: "utf8" })
const summary = {}

for (const source of SOURCES) {
  const base = await resolveLayer(source.base)
  const meta = await json(`${base}?f=json`)
  const dateField = pickDateField(meta, source)
  console.log(JSON.stringify({
    phase: "metadata",
    authority: source.code,
    base,
    layerName: meta.name,
    maxRecordCount: meta.maxRecordCount,
    dateField: dateField?.name || null,
    fields: (meta.fields || []).map((field) => `${field.name}:${field.type}`),
  }))
  if (!dateField) {
    summary[source.code] = { skipped: "no received/application date field detected" }
    continue
  }

  summary[source.code] = {}
  for (const year of YEARS) {
    const where = yearWhere(dateField, year)
    const expected = await countFor(base, where)
    const features = await featuresFor(base, where)
    summary[source.code][year] = { expected, fetched: features.length }
    for (const feature of features) {
      stream.write(`${JSON.stringify({ source: { code: source.code, authority: source.authority, base, dateField: dateField.name }, feature })}\n`)
    }
    console.log(JSON.stringify({ authority: source.code, year, expected, fetched: features.length }))
    if (features.length !== expected) throw new Error(`${source.code} ${year}: expected ${expected}, fetched ${features.length}`)
  }
}

stream.end()
await new Promise((resolve, reject) => { stream.on("finish", resolve); stream.on("error", reject) })
console.log(JSON.stringify({ phase: "complete", output: OUTPUT, summary }))
