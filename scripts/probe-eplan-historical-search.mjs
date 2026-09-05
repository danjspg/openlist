const API = "https://services.arcgis.com/NzlPQPKn5QF9v2US/arcgis/rest/services/IrishPlanningApplications/FeatureServer/0/query"
async function count(where) {
  const url = new URL(API)
  url.searchParams.set("where", where)
  url.searchParams.set("returnCountOnly", "true")
  url.searchParams.set("f", "json")
  const response = await fetch(url, { signal: AbortSignal.timeout(30000) })
  const json = await response.json()
  return { status: response.status, ...json }
}
const output = {
  total: await count("1=1"),
  historical: await count("ReceivedDate >= '2012-01-01 00:00:00' AND ReceivedDate < '2017-01-01 00:00:00'"),
  byYear: {},
}
for (let year = 2012; year <= 2016; year += 1) {
  output.byYear[year] = await count(`ReceivedDate >= '${year}-01-01 00:00:00' AND ReceivedDate < '${year + 1}-01-01 00:00:00'`)
}
console.log(JSON.stringify(output))
