import { spawn } from "child_process"
import { createWriteStream } from "fs"
import { mkdir, stat, unlink } from "fs/promises"
import https from "https"
import path from "path"
import { fileURLToPath } from "url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, "..")
const dataDir = path.join(repoRoot, "data", "ppr")
const allowInsecureTls = process.env.PPR_ALLOW_INSECURE_TLS === "1"

const args = process.argv.slice(2)
const shouldIngest = args.includes("--ingest")
const years = args
  .filter((arg) => arg !== "--ingest")
  .map((arg) => Number(arg))
  .filter((year) => Number.isInteger(year) && year >= 2010 && year <= 2100)

if (years.length === 0) {
  console.error("Usage: node scripts/download-ppr-csvs.mjs [--ingest] 2026 2025 2024")
  process.exit(1)
}

if (allowInsecureTls) {
  console.warn("PPR_ALLOW_INSECURE_TLS=1 is enabled for this download run.")
}

function downloadUrl(year) {
  return `https://www.propertypriceregister.ie/website/npsra/pprweb.nsf/PPRDownloads?County=ALL&Year=${year}&Month=ALL&OpenForm=&File=PPR-${year}.csv`
}

function resolveUrl(href) {
  return new URL(href, "https://www.propertypriceregister.ie").toString()
}

function findCsvLink(html, year) {
  const match = html.match(
    new RegExp(`href="([^"]*PPR-${year}\\.csv[^"]*)"`, "i")
  )

  return match ? resolveUrl(match[1].replace(/&amp;/g, "&")) : null
}

function formatMb(bytes) {
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`
}

async function fileSize(filePath) {
  const info = await stat(filePath)
  return info.size
}

async function fileExists(filePath) {
  try {
    await stat(filePath)
    return true
  } catch {
    return false
  }
}

function request(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(
      url,
      {
        headers: {
          "User-Agent": "OpenList PPR downloader",
        },
        rejectUnauthorized: !allowInsecureTls,
      },
      (res) => resolve(res)
    )

    req.on("error", reject)
    req.setTimeout(30000, () => {
      req.destroy(new Error("Request timed out"))
    })
  })
}

async function readTextResponse(res) {
  const chunks = []

  for await (const chunk of res) {
    chunks.push(Buffer.from(chunk))
  }

  return Buffer.concat(chunks).toString("utf8")
}

async function saveResponse(res, filePath) {
  await new Promise((resolve, reject) => {
    const file = createWriteStream(filePath)

    res.pipe(file)
    file.on("finish", () => file.close(resolve))
    file.on("error", reject)
    res.on("error", reject)
  })
}

async function downloadFile(url, filePath) {
  const res = await request(url)

  if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
    return downloadFile(resolveUrl(res.headers.location), filePath)
  }

  if (res.statusCode !== 200) {
    throw new Error(`HTTP ${res.statusCode}`)
  }

  const contentType = res.headers["content-type"] || ""

  if (String(contentType).includes("text/html")) {
    const html = await readTextResponse(res)
    const year = path.basename(filePath).match(/\d{4}/)?.[0]
    const csvUrl = year ? findCsvLink(html, year) : null

    if (!csvUrl) {
      throw new Error("CSV link not found on download page")
    }

    return downloadFile(csvUrl, filePath)
  }

  await saveResponse(res, filePath)
}

async function downloadWithRetry(year, filePath) {
  const url = downloadUrl(year)

  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      await downloadFile(url, filePath)
      return { ok: true, error: "" }
    } catch (error) {
      await unlink(filePath).catch(() => {})

      if (attempt === 2) {
        return {
          ok: false,
          error: error instanceof Error ? error.message : "Unknown error",
        }
      }

      console.log(`${year}: download failed, retrying once...`)
    }
  }

  return { ok: false, error: "Unknown error" }
}

async function ingestFile(filePath) {
  await new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      ["scripts/ingest-ppr-csv.mjs", filePath],
      {
        cwd: repoRoot,
        env: process.env,
        stdio: "inherit",
      }
    )

    child.on("error", reject)
    child.on("exit", (code) => {
      if (code === 0) resolve()
      else reject(new Error(`ingest exited with code ${code}`))
    })
  })
}

await mkdir(dataDir, { recursive: true })

const summary = []

for (const year of years) {
  const filePath = path.join(dataDir, `PPR-${year}.csv`)
  const exists = await fileExists(filePath)

  if (exists) {
    const size = await fileSize(filePath)
    console.log(`${year}: skipped existing file (${formatMb(size)})`)

    if (shouldIngest) {
      console.log(`${year}: ingesting existing file...`)
      await ingestFile(filePath)
    }

    summary.push({ year, status: "skipped", filePath, size, error: "" })
    continue
  }

  console.log(`${year}: downloading...`)
  const result = await downloadWithRetry(year, filePath)

  if (!result.ok) {
    console.error(`${year}: failed - ${result.error}`)
    summary.push({ year, status: "failed", filePath, size: 0, error: result.error })
    continue
  }

  const size = await fileSize(filePath)
  console.log(`${year}: downloaded ${formatMb(size)}`)

  if (shouldIngest) {
    console.log(`${year}: ingesting downloaded file...`)
    await ingestFile(filePath)
  }

  summary.push({ year, status: "downloaded", filePath, size, error: "" })
}

console.log("\nPPR download summary")
for (const item of summary) {
  const detail =
    item.status === "failed"
      ? item.error
      : `${formatMb(item.size)} - ${item.filePath}`

  console.log(`${item.year}: ${item.status} - ${detail}`)
}
