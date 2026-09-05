import fs from "node:fs"

const OUTPUT = process.argv[2] || ".tmp/planning-authority-archives-2012-2016.ndjson"
const PAGE_SIZE = 2000
const SOURCES = [
  { code: "KILDARE", authority: "Kildare County Council", base: "https://services-eu1.arcgis.com/7382h3fBABGPKrTJ/arcgis/rest/services/KCC_Planning_Points/FeatureServer/0", years: [2012,2013,2014,2015,2016], kind: "kildare" },
  { code: "GALWAYCOCO", authority: "Galway County Council", base: "https://services1.arcgis.com/mJI7JYqAOKXPG7Hh/arcgis/rest/services/GCC_PlanningRegisterPts_95_15/FeatureServer/0", years: [2012,2013,2014,2015], kind: "galway" },
  { code: "GALWAYCOCO", authority: "Galway County Council", base: "https://services1.arcgis.com/mJI7JYqAOKXPG7Hh/arcgis/rest/services/GCC_PlanningRegisterPts_16/FeatureServer", years: [2016], kind: "galway" },
]
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function json(url) {
  for (let attempt=1; attempt<=4; attempt+=1) {
    try {
      const response = await fetch(url, { headers: { "User-Agent": "OpenList finite historical archive migration" }, signal: AbortSignal.timeout(30000) })
      const body = await response.json()
      if (!response.ok || body.error) throw new Error(`ArcGIS ${response.status}: ${JSON.stringify(body.error || body).slice(0,300)}`)
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
  const layer = service.layers?.[0]
  if (!layer) throw new Error(`No ArcGIS layer found for ${base}`)
  return `${base}/${layer.id}`
}
function whereFor(source, fields, year) {
  if (fields.has("Year")) return `Year = ${year}`
  const type = fields.get("ReceivedDate")
  if (type === "esriFieldTypeString") return `ReceivedDate LIKE '%/${year}'`
  if (type) return `ReceivedDate >= DATE '${year}-01-01' AND ReceivedDate < DATE '${year+1}-01-01'`
  throw new Error(`No supported received-date field for ${source.code}`)
}
async function featuresFor(base, where) {
  const all = []
  for (let offset=0; ; offset+=PAGE_SIZE) {
    const url = new URL(`${base}/query`)
    for (const [key,value] of Object.entries({ where, outFields:"*", returnGeometry:"true", outSR:"2157", resultOffset:String(offset), resultRecordCount:String(PAGE_SIZE), f:"json" })) url.searchParams.set(key,value)
    const body = await json(url)
    const page = body.features || []
    all.push(...page)
    if (page.length < PAGE_SIZE) break
  }
  return all
}

fs.mkdirSync(new URL(".", `file://${process.cwd()}/${OUTPUT}`).pathname, { recursive: true })
const stream = fs.createWriteStream(OUTPUT, { encoding: "utf8" })
const summary = {}
for (const source of SOURCES) {
  const base = await resolveLayer(source.base)
  const meta = await json(`${base}?f=json`)
  const fields = new Map((meta.fields || []).map((field) => [field.name, field.type]))
  for (const year of source.years) {
    const features = await featuresFor(base, whereFor(source, fields, year))
    summary[`${source.code}:${year}`] = features.length
    for (const feature of features) stream.write(`${JSON.stringify({ source: { code:source.code, authority:source.authority, kind:source.kind, base }, feature })}\n`)
    console.log(JSON.stringify({ authority: source.code, year, fetched: features.length }))
  }
}
stream.end()
await new Promise((resolve,reject) => { stream.on("finish",resolve); stream.on("error",reject) })
console.log(JSON.stringify({ phase:"complete", output:OUTPUT, summary }))
