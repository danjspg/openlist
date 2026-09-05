const AUTHORITIES = [
  { code: "CARLOW", names: ["Carlow County Council", "Carlow"] },
  { code: "CAVAN", names: ["Cavan County Council", "Cavan"] },
  { code: "CLARE", names: ["Clare County Council", "Clare"] },
  { code: "CORKCITY", names: ["Cork City Council", "Cork City"] },
  { code: "CORKCOCO", names: ["Cork County Council", "Cork County"] },
  { code: "DUBLINCC", names: ["Dublin City Council", "Dublin City"] },
  { code: "FINGAL", names: ["Fingal County Council", "Fingal"] },
  { code: "GALWAYCITY", names: ["Galway City Council", "Galway City"] },
  { code: "KERRY", names: ["Kerry County Council", "Kerry"] },
  { code: "KILKENNY", names: ["Kilkenny County Council", "Kilkenny"] },
  { code: "LAOIS", names: ["Laois County Council", "Laois"] },
  { code: "LEITRIM", names: ["Leitrim County Council", "Leitrim"] },
  { code: "LIMERICK", names: ["Limerick City and County Council", "Limerick County Council", "Limerick"] },
  { code: "LONGFORD", names: ["Longford County Council", "Longford"] },
  { code: "LOUTH", names: ["Louth County Council", "Louth"] },
  { code: "MAYO", names: ["Mayo County Council", "Mayo"] },
  { code: "MONAGHAN", names: ["Monaghan County Council", "Monaghan"] },
  { code: "OFFALY", names: ["Offaly County Council", "Offaly"] },
  { code: "ROSCOMMON", names: ["Roscommon County Council", "Roscommon"] },
  { code: "SLIGO", names: ["Sligo County Council", "Sligo"] },
  { code: "TIPPERARY", names: ["Tipperary County Council", "Tipperary"] },
  { code: "WATERFORD", names: ["Waterford City and County Council", "Waterford County Council", "Waterford"] },
  { code: "WESTMEATH", names: ["Westmeath County Council", "Westmeath"] },
  { code: "WEXFORD", names: ["Wexford County Council", "Wexford"] },
  { code: "WICKLOW", names: ["Wicklow County Council", "Wicklow"] },
]

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function json(url) {
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: { "User-Agent": "OpenList planning archive discovery" },
        signal: AbortSignal.timeout(30000),
      })
      const body = await response.json()
      if (!response.ok || body.error) throw new Error(`ArcGIS ${response.status}: ${JSON.stringify(body.error || body).slice(0,500)}`)
      return body
    } catch (error) {
      if (attempt === 4) throw error
      await sleep(attempt * 750)
    }
  }
}

function scoreItem(item) {
  const text = `${item.title || ""} ${(item.tags || []).join(" ")} ${item.snippet || ""} ${item.description || ""}`.toLowerCase()
  let score = 0
  if (/planning application/.test(text)) score += 8
  if (/planning/.test(text)) score += 4
  if (/historical|historic|register/.test(text)) score += 4
  if (/application/.test(text)) score += 2
  if (/point|site|finder|public/.test(text)) score += 1
  if (/zoning|development plan|landscape|protected structure|rps|heritage|fire station/.test(text)) score -= 6
  return score
}

function interestingFields(fields) {
  return (fields || []).filter((f) => /(ref|file|application|received|reciev|date|decision|status|develop|description|location|address|applicant|easting|northing|lat|long)/i.test(f.name)).map((f) => `${f.name}:${f.type}`)
}

for (const authority of AUTHORITIES) {
  const byId = new Map()
  for (const name of authority.names) {
    for (const q of [
      `${name} planning type:"Feature Service"`,
      `${name} planning application type:"Feature Service"`,
      `${name} planning register type:"Feature Service"`,
      `${name} historical planning type:"Feature Service"`,
    ]) {
      const u = new URL("https://www.arcgis.com/sharing/rest/search")
      u.searchParams.set("q", q)
      u.searchParams.set("num", "100")
      u.searchParams.set("f", "json")
      const body = await json(u)
      for (const item of body.results || []) {
        if (item.type !== "Feature Service" || !item.url) continue
        if (!byId.has(item.id)) byId.set(item.id, item)
      }
      await sleep(100)
    }
  }

  const ranked = [...byId.values()].map((item) => ({ item, score: scoreItem(item) })).filter((x) => x.score > 0).sort((a,b) => b.score - a.score).slice(0, 12)
  const inspected = []
  for (const { item, score } of ranked) {
    try {
      const service = await json(`${item.url}?f=json`)
      const layers = service.layers || []
      for (const layer of layers.slice(0, 6)) {
        const meta = await json(`${item.url}/${layer.id}?f=json`)
        const fields = interestingFields(meta.fields)
        const hasDate = fields.some((f) => /(Received|Reciev|ApplicationDate|AppDate|DateReceived|received_|received_d)/i.test(f))
        const hasRef = fields.some((f) => /(Reference|ApplicationNumber|PlanningReference|File|PlanFile|FILE_NUMBE|file_number)/i.test(f))
        inspected.push({
          title: item.title,
          owner: item.owner,
          url: `${item.url}/${layer.id}`,
          layer: meta.name,
          score,
          maxRecordCount: meta.maxRecordCount || service.maxRecordCount || null,
          hasDate,
          hasRef,
          fields,
        })
      }
    } catch (error) {
      inspected.push({ title: item.title, owner: item.owner, url: item.url, score, error: String(error?.message || error).slice(0,300) })
    }
  }
  inspected.sort((a,b) => Number(b.hasDate) - Number(a.hasDate) || Number(b.hasRef) - Number(a.hasRef) || b.score - a.score)
  console.log(JSON.stringify({ authority: authority.code, candidates: inspected.slice(0, 20) }))
}
