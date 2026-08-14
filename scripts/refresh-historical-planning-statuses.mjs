import { spawn } from "child_process"
import path from "path"
import { fileURLToPath } from "url"
import { createClient } from "@supabase/supabase-js"
import { formatErrorForLog } from "./ppr-error-format.mjs"

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const DEFAULT_BUCKET_LIMIT = Number(process.env.PLANNING_STATUS_BUCKET_LIMIT || 12)
const CORK_COUNTY_CODE = "CORKCOCO"

if (!supabaseUrl || !serviceRoleKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY")
  process.exit(1)
}

const supabase = createClient(supabaseUrl, serviceRoleKey)

function parseArgs(argv) {
  const options = { bucketLimit: DEFAULT_BUCKET_LIMIT, dryRun: false }
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === "--dry-run") options.dryRun = true
    else if (arg === "--bucket-limit") options.bucketLimit = Number(argv[++index])
    else throw new Error(`Unknown argument: ${arg}`)
  }
  if (!Number.isInteger(options.bucketLimit) || options.bucketLimit < 1 || options.bucketLimit > 50) {
    throw new Error("--bucket-limit must be an integer between 1 and 50")
  }
  return options
}

function addDays(value, days) {
  const date = new Date(`${value}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

async function runScript(args) {
  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, {
      cwd: repoRoot,
      env: process.env,
      stdio: "inherit",
    })
    child.on("error", reject)
    child.on("exit", (code) => {
      if (code === 0) resolve()
      else reject(new Error(`${args.join(" ")} exited with code ${code}`))
    })
  })
}

async function refreshBucket(bucket, dryRun) {
  const from = bucket.period_start
  const to = addDays(bucket.period_end, -1)
  const args = bucket.local_authority_code === CORK_COUNTY_CODE
    ? [
        "scripts/ingest-cork-planning-applications.mjs",
        from,
        to,
        "--window-days",
        "31",
      ]
    : [
        "scripts/ingest-national-planning-applications.mjs",
        "--from",
        from,
        "--to",
        to,
        "--authority",
        bucket.local_authority_code,
      ]

  if (dryRun) args.push("--dry-run")
  await runScript(args)

  if (dryRun) return
  const { error } = await supabase.rpc("openlist_mark_planning_status_bucket_checked", {
    p_authority_code: bucket.local_authority_code,
    p_period_start: from,
    p_period_end: bucket.period_end,
  })
  if (error) throw error
}

async function run(options) {
  const { data, error } = await supabase.rpc("openlist_planning_status_refresh_buckets", {
    p_bucket_limit: options.bucketLimit,
  })
  if (error) throw error

  const buckets = data || []
  console.log(
    `Historical planning status refresh selected ${buckets.length}/${options.bucketLimit} bounded authority-month buckets.`
  )

  for (const [index, bucket] of buckets.entries()) {
    console.log(
      `[${index + 1}/${buckets.length}] ${bucket.local_authority_code} ${bucket.period_start} (${bucket.candidate_count} candidates, last checked ${bucket.least_recently_checked_at || "never"})`
    )
    await refreshBucket(bucket, options.dryRun)
  }
}

run(parseArgs(process.argv.slice(2))).catch((error) => {
  console.error(formatErrorForLog(error))
  process.exit(1)
})
