const YEARS = [2012, 2013, 2014, 2015, 2016]

const SOURCES = [
  { code: "CARLOW", base: "https://utility.arcgis.com/usrsvcs/servers/c8a29b1b20d6426d85246b9bdfb4e975/rest/services/Planning_Sites_Carlow/FeatureServer/0", field: "ReceivedDate", mode: "date" },
  { code: "CAVAN", base: "https://services-eu1.arcgis.com/JxeIFQJpAbht5VJy/arcgis/rest/services/Planning_Points/FeatureServer/0", field: "ReceivedDate", mode: "string" },
  { code: "CORKCITY", base: "https://services-eu1.arcgis.com/f0ZQOHXBIeLonX0V/arcgis/rest/services/PlanningPoint/FeatureServer/0", field: "DateReceiptAp", mode: "date" },
  { code: "GALWAYCITY", base: "https://services-eu1.arcgis.com/Zmea819kt4Uu8kML/arcgis/rest/services/PlanningOpendata/FeatureServer/0", field: "Receiveddate", mode: "string" },
  { code: "KERRY", base: "https://services2.arcgis.com/FQ08czOaoVds3IE4/arcgis/rest/services/planningeweb/FeatureServer/0", field: "Date_Received", mode: "date" },
  { code: "LAOIS", base: "https://utility.arcgis.com/usrsvcs/servers/f6717aa42d12440ca9fdd4909520efc8/rest/services/Planning_Sites_Laois/FeatureServer/0", field: "ReceivedDate", mode: "date" },
  { code: "LOUTH", base: "https://services-eu1.arcgis.com/021lZtUUnzKYjk3l/arcgis/rest/services/LCC_Planning_Map/FeatureServer/0", field: "RedDate", mode: "string" },
  { code: "MONAGHAN", base: "https://services-eu1.arcgis.com/YDJmfAKmZVpOnK2Q/arcgis/rest/services/PlanningPoints/FeatureServer/0", field: "ReceivedDate", mode: "string" },
  { code: "OFFALY", base: "https://services-eu1.arcgis.com/GoYdY5OITUvNLuuX/arcgis/rest/services/Historical_Planning_Applications/FeatureServer/0", field: "ReceivedDate", mode: "string" },
  { code: "ROSCOMMON", base: "https://services1.arcgis.com/0g8o874l5un2eDgz/arcgis/rest/services/Planning_Finder_App_Planning_Points_Historical/FeatureServer/0", field: "Received_Date", mode: "date" },
  { code: "WATERFORD", base: "https://services.arcgis.com/pMnvm7HXxTmNXxGi/arcgis/rest/services/WaterfordPlanningApplications/FeatureServer/0", field: "received_date", mode: "integer" },
  { code: "WESTMEATH", base: "https://services-eu1.arcgis.com/DsXSaNAVVnwb89Pt/arcgis/rest/services/Westmeath_Planning_Applications/FeatureServer/0", field: "RecievedDate", mode: "date" },
  { code: "WEXFORD", base: "https://services-eu1.arcgis.com/SEIHigRppeVyVssQ/arcgis/rest/services/Wexford_Planning_Apps_Point_and_Polygons_View/FeatureServer/0", field: "Reg_date", mode: "date" },
]

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function json(url) {
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    try {
      const response = await fetch(url, { headers: { "User-Agent": "OpenList historical planning count sweep" }, signal: AbortSignal.timeout(30000) })
      const body = await response.json()
      if (!response.ok || body.error) throw new Error(`ArcGIS ${response.status}: ${JSON.stringify(body.error || body).slice(0, 500)}`)
      return body
    } catch (error) {
      if (attempt === 4) throw error
      await sleep(attempt * 1000)
    }
  }
}

function whereFor(source, year) {
  if (source.mode === "date") return `${source.field} >= DATE '${year}-01-01' AND ${source.field} < DATE '${year + 1}-01-01'`
  if (source.mode === "string") return `${source.field} LIKE '%${year}%'`
  if (source.mode === "integer") return `${source.field} >= ${year}0101 AND ${source.field} <= ${year}1231`
  throw new Error(`Unknown mode ${source.mode}`)
}

async function countFor(source, where) {
  const url = new URL(`${source.base}/query`)
  url.searchParams.set("where", where)
  url.searchParams.set("returnCountOnly", "true")
  url.searchParams.set("f", "json")
  const body = await json(url)
  return Number(body.count || 0)
}

async function sampleFor(source) {
  const url = new URL(`${source.base}/query`)
  url.searchParams.set("where", `${source.field} IS NOT NULL`)
  url.searchParams.set("outFields", source.field)
  url.searchParams.set("returnGeometry", "false")
  url.searchParams.set("resultRecordCount", "5")
  url.searchParams.set("f", "json")
  const body = await json(url)
  return (body.features || []).map((f) => f.attributes?.[source.field]).filter((v) => v !== null && v !== undefined)
}

const summary = {}
let grandTotal = 0
for (const source of SOURCES) {
  const result = { sample: [], years: {}, total: 0 }
  try {
    result.sample = await sampleFor(source)
    for (const year of YEARS) {
      const count = await countFor(source, whereFor(source, year))
      result.years[year] = count
      result.total += count
      await sleep(100)
    }
    grandTotal += result.total
    console.log(JSON.stringify({ authority: source.code, ...result }))
  } catch (error) {
    result.error = String(error?.message || error)
    console.log(JSON.stringify({ authority: source.code, ...result }))
  }
  summary[source.code] = result
}
console.log(JSON.stringify({ phase: "complete", grandTotal, summary }))
