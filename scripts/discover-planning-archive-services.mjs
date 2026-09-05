const AUTHORITIES = [
  "Kilkenny County Council",
  "Laois County Council",
  "Wicklow County Council",
  "Mayo County Council",
  "Kerry County Council",
  "Clare County Council",
  "Tipperary County Council",
  "Limerick City and County Council",
  "Waterford City and County Council",
  "Westmeath County Council",
  "Offaly County Council",
  "Cavan County Council",
  "Monaghan County Council",
  "Sligo County Council",
  "Roscommon County Council",
  "Longford County Council",
  "Leitrim County Council",
]

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function json(url) {
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: { "User-Agent": "OpenList official planning archive discovery" },
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

for (const authority of AUTHORITIES) {
  const search = new URL("https://www.arcgis.com/sharing/rest/search")
  search.searchParams.set("q", `\"${authority}\" planning type:\"Feature Service\"")
  search.searchParams.set("num", "100")
  search.searchParams.set("f", "json")
  const body = await json(search)
  const candidates = (body.results || [])
    .filter((item) => /planning/i.test(`${item.title || ""} ${item.tags?.join(" ") || ""} ${item.description || ""}`))
    .map((item) => ({ id:item.id, title:item.title, owner:item.owner, url:item.url || null, modified:item.modified || null, tags:item.tags || [] }))
  console.log(JSON.stringify({ authority, candidates }))
  await sleep(200)
}
