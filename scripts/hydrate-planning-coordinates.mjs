import { createReadStream } from "node:fs"
import { createInterface } from "node:readline"
import { createClient } from "@supabase/supabase-js"

const DEFAULT_INPUT = "national-planning-coordinates.ndjson"
const DEFAULT_BATCH_SIZE = 100
const DEFAULT_DELAY_MS = 500
const MAX_BATCH_SIZE = 250

const AUTHORITY_CODES = new Map([
  ["Cork County Council", "CORKCOCO"],
  ["Cork City Council", "CORKCITY"],
  ["Dublin City Council", "DUBLINCITY"],
  ["Fingal County Council", "FINGAL"],
  ["South Dublin County Council", "SOUTHDUBLIN"],
  ["Dun Laoghaire Rathdown County Council", "DLR"],
  ["Kildare County Council", "KILDARE"],
  ["Galway County Council", "GALWAYCOCO"],
  ["Galway City Council", "GALWAYCITY"],
  ["Meath County Council", "MEATH"],
  ["Wicklow County Council", "WICKLOW"],
  ["Limerick County Council", "LIMERICK"],
  ["Waterford City and County Council", "WATERFORD"],
  ["Donegal County Council", "DONEGAL"],
  ["Wexford County Council", "WEXFORD"],
  ["Tipperary County Council", "TIPPERARY"],
  ["Kerry County Council", "KERRY"],
  ["Mayo County Council", "MAYO"],
  ["Clare County Council", "CLARE"],
  ["Louth County Council", "LOUTH"],
  ["Laois County Council", "LAOIS"],
  ["Kilkenny County Council", "KILKENNY"],
  ["Offaly County Council", "OFFALY"],
  ["Cavan County Council", "CAVAN"],
  ["Roscommon County Council", "ROSCOMMON"],
  ["Westmeath County Council", "WESTMEATH"],
  ["Monaghan County Council", "MONAGHAN"],
  ["Sligo County Council", "SLIGO"],
  ["Carlow County Council", "CARLOW"],
  ["Longford County Council", "LONGFORD"],
  ["Leitrim County Council", "LEITRIM"],
])

function parseArgs(argv) {
  const options = {
    input: DEFAULT_INPUT,
    batchSize: DEFAULT_BATCH_SIZE,
    delayMs: DEFAULT_DELAY_MS,
    dryRun: false,
    maxRows: null,
  }

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === "--input") options.input = argv[++index]
    else if (arg === "--batch-size") options.batchSize = Number(argv[++index])
    else if (arg === "--delay-ms") options.delayMs = Number(argv[++index])
    else if (arg === "--max-rows") options.maxRows = Number(argv[++index])
    else if (arg === "--dry-run") options.dryRun = true
    else throw new Error(`Unknown argument: ${arg}`)
  }

  if (!Number.isInteger(options.batchSize) || options.batchSize < 1 || options.batchSize > MAX_BATCH_SIZE) {
    throw new Error(`--batch-size must be an integer between 1 and ${MAX_BATCH_SIZE}`)
  }
  if (!Number.isFinite(options.delayMs) || options.delayMs < 0) {
    throw new Error("--delay-ms must be zero or greater")
  }
  if (options.maxRows !== null && (!Number.isInteger(options.maxRows) || options.maxRows < 1)) {
    throw new Error("--max-rows must be a positive integer")
  }

  return options
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function normaliseRow(raw) {
  const authority = String(raw.authority || "").trim()
  const localAuthorityCode = AUTHORITY_CODES.get(authority)
  const reference = String(raw.reference || "").trim()
  const easting = Number(raw.easting)
  const northing = Number(raw.northing)

  if (!localAuthorityCode || !reference || !Number.isFinite(easting) || !Number.isFinite(northing)) {
    return null
  }

  return {
    local_authority_code: localAuthorityCode,
    reference,
    grid_easting: easting,
    grid_northing: northing,
  }
}

async function hydrateBatch(supabase, rows, dryRun) {
  if (dryRun) return { processed: rows.length, updated: 0, skipped_existing: 0, missing: 0 }

  const { data, error } = await supabase.rpc("openlist_hydrate_planning_coordinates", {
    p_rows: rows,
  })
  if (error) throw error
  return data
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!options.dryRun && (!supabaseUrl || !serviceRoleKey)) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY")
  }

  const supabase = options.dryRun ? null : createClient(supabaseUrl, serviceRoleKey)
  const input = createInterface({
    input: createReadStream(options.input, { encoding: "utf-8" }),
    crlfDelay: Infinity,
  })

  let batch = []
  let accepted = 0
  let invalid = 0
  let processed = 0
  let updated = 0
  let skippedExisting = 0
  let missing = 0

  async function flush() {
    if (batch.length === 0) return
    const result = await hydrateBatch(supabase, batch, options.dryRun)
    processed += Number(result?.processed || batch.length)
    updated += Number(result?.updated || 0)
    skippedExisting += Number(result?.skipped_existing || 0)
    missing += Number(result?.missing || 0)
    console.log(
      `Coordinate hydration: processed=${processed}, updated=${updated}, existing=${skippedExisting}, missing=${missing}, invalid=${invalid}`
    )
    batch = []
    if (!options.dryRun && options.delayMs > 0) await sleep(options.delayMs)
  }

  for await (const line of input) {
    if (!line.trim()) continue
    const row = normaliseRow(JSON.parse(line))
    if (!row) {
      invalid += 1
      continue
    }

    accepted += 1
    batch.push(row)
    if (batch.length >= options.batchSize) await flush()

    if (options.maxRows !== null && accepted >= options.maxRows) break
  }

  await flush()
  console.log(
    `Coordinate hydration complete: accepted=${accepted}, processed=${processed}, updated=${updated}, existing=${skippedExisting}, missing=${missing}, invalid=${invalid}, dryRun=${options.dryRun}`
  )
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
