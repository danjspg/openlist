const SERVICES = [
  ["kildare", "https://services-eu1.arcgis.com/7382h3fBABGPKrTJ/arcgis/rest/services/KCC_Planning_Points/FeatureServer/0"],
  ["galway_1995_2015", "https://services1.arcgis.com/mJI7JYqAOKXPG7Hh/arcgis/rest/services/GCC_PlanningRegisterPts_95_15/FeatureServer/0"],
  ["galway_2016_plus", "https://services1.arcgis.com/mJI7JYqAOKXPG7Hh/arcgis/rest/services/GCC_PlanningRegisterPts_16/FeatureServer/0"],
]

async function json(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(30000) })
  const body = await response.json()
  return { status: response.status, body }
}

async function query(base, params) {
  const url = new URL(`${base}/query`)
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value)
  url.searchParams.set("f", "json")
  return json(url)
}

const output = {}
for (const [name, base] of SERVICES) {
  try {
    const metadata = await json(`${base}?f=json`)
    const fields = (metadata.body.fields || []).map(({ name, alias, type }) => ({ name, alias, type }))
    const sample = await query(base, { where: "1=1", outFields: "*", returnGeometry: "true", resultRecordCount: "2" })
    const total = await query(base, { where: "1=1", returnCountOnly: "true" })
    output[name] = {
      metadataStatus: metadata.status,
      name: metadata.body.name,
      objectIdField: metadata.body.objectIdField,
      maxRecordCount: metadata.body.maxRecordCount,
      fields,
      total: total.body.count ?? total.body,
      sample: (sample.body.features || []).slice(0, 2),
      sampleError: sample.body.error || null,
    }
  } catch (error) {
    output[name] = { error: String(error?.stack || error) }
  }
}
console.log(JSON.stringify(output))
