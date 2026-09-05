import fs from "node:fs"

const OUTPUT = process.argv[2] || ".tmp/planning-archive-candidates-2012-2016.ndjson"
const PAGE_SIZE = 1000
const YEARS = [2012, 2013, 2014, 2015, 2016]
const COMMON_DATES = ["received_d", "RecievedDate", "Received_Date", "ReceivedDate", "received_date", "Receiveddate", "DateReceiptAp", "Date_Received", "RedDate", "Reg_date", "DateReceived", "DATE_RECEIVED", "RECEIVED", "REC_DATE", "RECDATE", "AppDate", "APPDATE", "ApplicationDate", "Application_Date", "DATE", "Date"]
const SOURCES = [
  {
    code: "DONEGAL",
    authority: "Donegal County Council",
    base: "https://services2.arcgis.com/WRtfelnPg3R7bCEW/ArcGIS/rest/services/Applications_since_2010_Pro/FeatureServer/0",
    dateCandidates: ["received_d", ...COMMON_DATES],
  },
  {
    code: "MEATH",
    authority: "Meath County Council",
    base: "https://services-eu1.arcgis.com/33tCl0taHHdVAN9O/arcgis/rest/services/DM_PACE_PlanningApplicationPublic/FeatureServer/1",
    dateCandidates: ["RecievedDate", ...COMMON_DATES],
  },
  {
    code: "CARLOW",
    authority: "Carlow County Council",
    base: "https://utility.arcgis.com/usrsvcs/servers/c8a29b1b20d6426d85246b9bdfb4e975/rest/services/Planning_Sites_Carlow/FeatureServer/0",
    dateCandidates: ["ReceivedDate", ...COMMON_DATES],
  },
  {
    code: "CAVAN",
    authority: "Cavan County Council",
    base: "https://services-eu1.arcgis.com/JxeIFQJpAbht5VJy/arcgis/rest/services/Planning_Points/FeatureServer/0",
    dateCandidates: ["ReceivedDate", ...COMMON_DATES],
  },
  {
    code: "CORKCITY",
    authority: "Cork City Council",
    base: "https://services-eu1.arcgis.com/f0ZQOHXBIeLonX0V/arcgis/rest/services/PlanningPoint/FeatureServer/0",
    dateCandidates: ["DateReceiptAp", ...COMMON_DATES],
  },
  {
    code: "GALWAYCITY",
    authority: "Galway City Council",
    base: "https://services-eu1.arcgis.com/Zmea819kt4Uu8kML/arcgis/rest/services/PlanningOpendata/FeatureServer/0",
    dateCandidates: ["Receiveddate", ...COMMON_DATES],
  },
  {
    code: "LAOIS",
    authority: "Laois County Council",
    base: "https://utility.arcgis.com/usrsvcs/servers/f6717aa42d12440ca9fdd4909520efc8/rest/services/Planning_Sites_Laois/FeatureServer/0",
    dateCandidates: ["ReceivedDate", ...COMMON_DATES],
  },
  {
    code: "LOUTH",
    authority: "Louth County Council",
    base: "https://services-eu1.arcgis.com/021lZtUUnzKYjk3l/arcgis/rest/services/LCC_Planning_Map/FeatureServer/0",
    dateCandidates: ["RedDate", ...COMMON_DATES],
  },
  {
    code: "MONAGHAN",
    authority: "Monaghan County Council",
    base: "https://services-eu1.arcgis.com/YDJmfAKmZVpOnK2Q/arcgis/rest/services/PlanningPoints/FeatureServer/0",
    dateCandidates: ["ReceivedDate", ...COMMON_DATES],
  },
  {
    code: "OFFALY",
    authority: "Offaly County Council",
    base: "https://services-eu1.arcgis.com/GoYdY5OITUvNLuuX/arcgis/rest/services/Historical_Planning_Applications/FeatureServer/0",
    dateCandidates: ["ReceivedDate", ...COMMON_DATES],
  },
  {
    code: "ROSCOMMON",
    authority: "Roscommon County Council",
    base: "https://services1.arcgis.com/0g8o874l5un2eDgz/arcgis/rest/services/Planning_Finder_App_Planning_Points_Historical/FeatureServer/0",
    dateCandidates: ["Received_Date", "ReceivedDate", ...COMMON_DATES],
  },
  {
    code: "WESTMEATH",
    authority: "Westmeath County Council",
    base: "https://services-eu1.arcgis.com/DsXSaNAVVnwb89Pt/arcgis/rest/services/Westmeath_Planning_Applications/FeatureServer/0",
    dateCandidates: ["RecievedDate", ...COMMON_DATES],
  },
  {
    code: "WICKLOW",
    authority: "Wicklow County Council",
    base: "https://services.arcgis.com/hQOfkHGHCu8mgDpG/arcgis/rest/services/External_Planning_Apps/FeatureServer/0",
    dateCandidates: ["received_date", ...COMMON_DATES],
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
  if (["esriFieldTypeDate", "esriFieldTypeDateOnly"].includes(field.type)) {
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
let successfulSources = 0
let totalFetched = 0

for (const source of SOURCES) {
  try {
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
    let sourceFetched = 0
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
      sourceFetched += features.length
    }
    summary[source.code].total = sourceFetched
    totalFetched += sourceFetched
    successfulSources += 1
  } catch (error) {
    summary[source.code] = { error: String(error?.message || error) }
    console.error(JSON.stringify({ phase: "source_error", authority: source.code, error: String(error?.message || error) }))
  }
}

stream.end()
await new Promise((resolve, reject) => { stream.on("finish", resolve); stream.on("error", reject) })
console.log(JSON.stringify({ phase: "complete", output: OUTPUT, successfulSources, totalFetched, summary }))
if (successfulSources === 0) throw new Error("No planning archive sources completed successfully")
