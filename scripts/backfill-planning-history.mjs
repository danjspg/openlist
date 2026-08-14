import { spawn } from "child_process"
import path from "path"
import { fileURLToPath } from "url"
import { formatErrorForLog } from "./ppr-error-format.mjs"

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const currentYear = new Date().getUTCFullYear()

function parseYear(value, label) {
  const year = Number(value)
  if (!Number.isInteger(year) || year < 2012 || year > currentYear) {
    throw new Error(`${label} must be between 2012 and ${currentYear}`)
  }
  return year
}

function parseArgs(argv) {
  const options = {
    fromYear: 2012,
    toYear: currentYear,
    authorities: [],
    dryRun: false,
    countOnly: false,
    skipCorkCounty: false,
  }

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === "--from-year") options.fromYear = parseYear(argv[++index], arg)
    else if (arg === "--to-year") options.toYear = parseYear(argv[++index], arg)
    else if (arg === "--authority") options.authorities.push(argv[++index])
    else if (arg === "--dry-run") options.dryRun = true
    else if (arg === "--count-only") options.countOnly = true
    else if (arg === "--skip-cork-county") options.skipCorkCounty = true
    else throw new Error(`Unknown argument: ${arg}`)
  }

  if (options.fromYear > options.toYear) {
    throw new Error("--from-year must be before or equal to --to-year")
  }
  return options
}

function dateRange(year) {
  return {
    from: `${year}-01-01`,
    to:
      year === currentYear
        ? new Date().toISOString().slice(0, 10)
        : `${year}-12-31`,
  }
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

function includesCorkCounty(options) {
  if (options.skipCorkCounty) return false
  if (options.authorities.length === 0) return true
  return options.authorities.some((value) =>
    ["corkcoco", "cork county council"].includes(value.toLowerCase())
  )
}

function nationalAuthorityArgs(options) {
  return options.authorities
    .filter(
      (value) => !["corkcoco", "cork county council"].includes(value.toLowerCase())
    )
    .flatMap((value) => ["--authority", value])
}

async function run(options) {
  const failures = []
  const nationalAuthorities = nationalAuthorityArgs(options)
  const runNational = options.authorities.length === 0 || nationalAuthorities.length > 0

  for (let year = options.fromYear; year <= options.toYear; year += 1) {
    const range = dateRange(year)
    console.log(`\n=== Planning ${range.from} to ${range.to} ===`)

    if (runNational) {
      const args = [
        "scripts/ingest-national-planning-applications.mjs",
        "--from",
        range.from,
        "--to",
        range.to,
        ...nationalAuthorities,
      ]
      if (options.countOnly) args.push("--count-only")
      else if (options.dryRun) args.push("--dry-run")

      try {
        await runScript(args)
      } catch (error) {
        failures.push({ year, source: "national", error: formatErrorForLog(error) })
        console.error(`${year}: national source failed; continuing to the next bounded source period`)
      }
    }

    if (includesCorkCounty(options) && !options.countOnly) {
      const args = [
        "scripts/ingest-cork-planning-applications.mjs",
        range.from,
        range.to,
        "--window-days",
        "31",
      ]
      if (options.dryRun) args.push("--dry-run")

      try {
        await runScript(args)
      } catch (error) {
        failures.push({ year, source: "cork-county", error: formatErrorForLog(error) })
        console.error(`${year}: Cork County source failed; continuing to the next bounded source period`)
      }
    }
  }

  console.log("\nPlanning historical backfill failures")
  console.log(JSON.stringify(failures, null, 2))
  if (failures.length > 0) {
    throw new Error(`${failures.length} bounded planning import(s) failed; rerun those periods.`)
  }
}

run(parseArgs(process.argv.slice(2))).catch((error) => {
  console.error(formatErrorForLog(error))
  process.exit(1)
})
