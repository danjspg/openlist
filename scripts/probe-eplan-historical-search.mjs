const KILDARE = "https://services-eu1.arcgis.com/7382h3fBABGPKrTJ/arcgis/rest/services/KCC_Planning_Points/FeatureServer/0"
const GALWAY_OLD = "https://services1.arcgis.com/mJI7JYqAOKXPG7Hh/arcgis/rest/services/GCC_PlanningRegisterPts_95_15/FeatureServer/0"

async function getJson(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(30000) })
  return { status: response.status, body: await response.json() }
}
async function query(base, where, extra = {}) {
  const url = new URL(`${base}/query`)
  url.searchParams.set("where", where)
  url.searchParams.set("f", "json")
  for (const [k, v] of Object.entries(extra)) url.searchParams.set(k, v)
  return getJson(url)
}
async function count(base, where) {
  const result = await query(base, where, { returnCountOnly: "true" })
  return result.body.count ?? result.body
}

const output = { kildare: {}, galway_1995_2015: {}, arcgisSearch: null }
for (let year = 2012; year <= 2016; year += 1) {
  output.kildare[year] = await count(KILDARE, `Year = ${year}`)
  if (year <= 2015) output.galway_1995_2015[year] = await count(GALWAY_OLD, `ReceivedDate LIKE '%/${year}'`)
}
const search = new URL("https://www.arcgis.com/sharing/rest/search")
search.searchParams.set("q", 'title:"GCC PlanningRegisterPts 16" owner:galwaycocogis')
search.searchParams.set("num", "20")
search.searchParams.set("f", "json")
output.arcgisSearch = (await getJson(search)).body
console.log(JSON.stringify(output))
