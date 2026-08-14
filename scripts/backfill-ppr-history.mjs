import { spawn } from "child_process"
import path from "path"
import { fileURLToPath } from "url"
import {
  ingestPprCsv,
  loadPprCsvRecords,
  summarisePprRecords,
} from "./ingest-ppr-csv.mjs"
import { rebuildPprPhase1Analytics } from "./rebuild-ppr-phase1-analytics.mjs"
import { formatErrorForLog } from "./ppr-error-format.mjs"

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const currentYear = new Date().getUTCFullYear()

function parseYear(value, label) {
  const year = Number(value)
  if (!Number.isInteger(year) || year < 2010 || year > currentYear) {
    throw new Error(`${label} must be between 2010 and ${currentYear}`)
  }
  return year
}

function parseArgs(argv) {
  const options = {
    fromYear: 2010,
    toYear: currentYear,
    download: true,
    rebuildDerived: true,
    sourceCountsOnly: false,
  }

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === "--from-year") options.fromYear = parseYear(argv[++index], arg)
    else if (arg === "--to-year") options.toYear = parseYear(argv[++index], arg)
    else if (arg === "--use-cache") options.download = false
    else if (arg === "--skip-derived") options.rebuildDerived = false
    else if (arg === "--source-counts-only") options.sourceCountsOnly = true
    else throw new Error(`Unknown argument: ${arg}`)
  }

  if (options.fromYear > options.toYear) {
    throw new Error("--from-year must be before or equal to --to-year")
  }
  return options
}

function annualSourceUrl(year) {
  return `https://www.propertypriceregister.ie/website/npsra/pprweb.nsf/PPRDownloads?County=ALL&Year=${year}&Month=ALL&OpenForm=&File=PPR-${year}.csv`
}

function csvPath(year) {
  return path.join(repoRoot, "data", "ppr", `PPR-${year}.csv`)
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

async function rebuildDerivedTables() {
  await runScript(["scripts/rebuild-ppr-summaries.mjs"])
  await rebuildPprPhase1Analytics()
}

async function run(options) {
  const failures = []
  const summary = []

  for (let year = options.fromYear; year <= options.toYear; year += 1) {
    console.log(`\n=== PPR ${year} ===`)
    try {
      if (options.download) {
        await runScript(["scripts/download-ppr-csvs.mjs", "--force", String(year)])
      }

      const loaded = await loadPprCsvRecords(csvPath(year), {
        sourceUrl: annualSourceUrl(year),
      })
      const uniqueRows = new Set(loaded.map((row) => row.source_row_hash)).size
      const sourceSummary = summarisePprRecords(loaded)
      console.log(
        `${year}: source rows ${sourceSummary.rowCount}, unique hashes ${uniqueRows}, duplicate source rows ${sourceSummary.rowCount - uniqueRows}, latest sale ${sourceSummary.latestSaleDate || "unknown"}`
      )

      if (options.sourceCountsOnly) {
        summary.push({
          year,
          sourceRows: sourceSummary.rowCount,
          uniqueRows,
          latestSaleDate: sourceSummary.latestSaleDate,
        })
        continue
      }

      const result = await ingestPprCsv({
        csvPath: csvPath(year),
        sourceUrl: annualSourceUrl(year),
        skipRebuild: true,
        records: loaded,
      })
      summary.push({
        year,
        sourceRows: sourceSummary.rowCount,
        uniqueRows,
        importedRows: result.insertedRows,
      })
    } catch (error) {
      failures.push({ year, error: formatErrorForLog(error) })
      console.error(`${year}: failed`)
      console.error(formatErrorForLog(error))
    }
  }

  console.log("\nPPR historical backfill summary")
  console.log(JSON.stringify({ summary, failures }, null, 2))

  if (failures.length > 0) {
    throw new Error(
      `${failures.length} PPR year(s) failed. Rerun the failed bounded years before rebuilding derived tables.`
    )
  }

  if (!options.sourceCountsOnly && options.rebuildDerived) {
    console.log("Rebuilding PPR derived tables once after the validated primary-row import...")
    await rebuildDerivedTables()
    console.log("PPR derived tables rebuilt successfully.")
  }
}

run(parseArgs(process.argv.slice(2))).catch((error) => {
  console.error(formatErrorForLog(error))
  process.exit(1)
})
