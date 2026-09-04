import { createWriteStream } from "node:fs"
import { once } from "node:events"

const FEATURE_LAYER_URL =
  "https://services.arcgis.com/NzlPQPKn5QF9v2US/ArcGIS/rest/services/IrishPlanningApplications/FeatureServer/0/query"

const DEFAULT_PAGE_SIZE = 2000
const DEFAULT_OUTPUT = "national-planning-coordinates.ndjson"

function parseArgs(argv) {
  const options = {
    output: DEFAULT_OUTPUT,
    pageSize: DEFAULT_PAGE_SIZE,
    authority: null,
  }

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === "--output") options.output = argv[++index]
    else if (arg === "--page-size") options.pageSize = Number(argv[++index])
    else if (arg === "--authority") options.authority = argv[++index]
    else throw new Error(`Unknown argument: ${arg}`)
  }

  if (!Number.isInteger(options.pageSize) || options.pageSize < 1 || options.pageSize > 2000) {
    throw new Error("--page-size must be an integer between 1 and 2000")
  }

  return options
}

function sqlString(value) {
  return String(value).replaceAll("'", "''")
}

async function queryPage({ authority, offset, pageSize }) {
  const where = authority
    ? `PlanningAuthority = '${sqlString(authority)}'`
    : "1=1"

  const params = new URLSearchParams({
    where,
    outFields: "OBJECTID,PlanningAuthority,ApplicationNumber",
    returnGeometry: "true",
    outSR: "2157",
    resultOffset: String(offset),
    resultRecordCount: String(pageSize),
    orderByFields: "OBJECTID ASC",
    f: "json",
  })

  const response = await fetch(`${FEATURE_LAYER_URL}?${params.toString()}`, {
    headers: { "User-Agent": "OpenList planning coordinate export" },
  })
  if (!response.ok) throw new Error(`ArcGIS coordinate export failed: HTTP ${response.status}`)

  const data = await response.json()
  if (data.error) throw new Error(data.error.message || JSON.stringify(data.error))
  return data
}

async function writeLine(stream, value) {
  if (!stream.write(`${JSON.stringify(value)}\n`)) await once(stream, "drain")
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  const output = createWriteStream(options.output, { encoding: "utf-8" })
  let offset = 0
  let exported = 0
  let skipped = 0

  try {
    while (true) {
      const data = await queryPage({
        authority: options.authority,
        offset,
        pageSize: options.pageSize,
      })
      const features = data.features || []

      for (const feature of features) {
        const attributes = feature.attributes || {}
        const geometry = feature.geometry || {}
        const reference = String(attributes.ApplicationNumber || "").trim()
        const authority = String(attributes.PlanningAuthority || "").trim()
        const easting = Number(geometry.x)
        const northing = Number(geometry.y)

        if (!reference || !authority || !Number.isFinite(easting) || !Number.isFinite(northing)) {
          skipped += 1
          continue
        }

        await writeLine(output, {
          object_id: Number.isInteger(attributes.OBJECTID) ? attributes.OBJECTID : null,
          authority,
          reference,
          easting,
          northing,
        })
        exported += 1
      }

      console.log(
        `ArcGIS coordinate export: offset=${offset}, page=${features.length}, exported=${exported}, skipped=${skipped}`
      )

      if (!data.exceededTransferLimit || features.length < options.pageSize) break
      offset += features.length
    }
  } finally {
    output.end()
    await once(output, "finish")
  }

  console.log(`Wrote ${exported} coordinate rows to ${options.output}; skipped ${skipped}.`)
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
