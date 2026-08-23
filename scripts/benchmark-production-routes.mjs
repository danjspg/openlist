#!/usr/bin/env node

import { execFile } from "node:child_process"
import { mkdir, writeFile } from "node:fs/promises"
import { dirname } from "node:path"
import { promisify } from "node:util"

const execFileAsync = promisify(execFile)
const origin = process.env.OPENLIST_BENCHMARK_ORIGIN || "https://www.openlist.ie"
const samples = Number(process.env.OPENLIST_BENCHMARK_SAMPLES || 3)
const delayMs = Number(process.env.OPENLIST_BENCHMARK_DELAY_MS || 1000)
const output = process.env.OPENLIST_BENCHMARK_OUTPUT || "docs/performance/production-route-after.json"

// Public, low-rate smoke coverage only. This is deliberately not a load test.
// Keep representative snapshot-backed, filtered, locality, dynamic and SEO routes
// here so a fast cache hit on one route does not hide a slow fallback elsewhere.
const routes = [
  "/",
  "/planning",
  "/planning/cork",
  "/planning/wexford",
  "/planning/longford",
  "/planning/westmeath",
  "/planning/cork?area=Carrigaline",
  "/planning/wexford?area=Wexford",
  "/planning/cork/areas/carrigaline",
  "/sold-prices",
  "/sold-prices/cork",
  "/sold-prices/cork/carrigaline",
  "/sitemap.xml",
  "/robots.txt",
]

const format = "%{http_code},%{time_starttransfer},%{time_total},%{size_download}"

async function sample(path) {
  const { stdout, stderr } = await execFileAsync("curl", [
    "--http1.1", "--compressed", "--silent", "--show-error", "--max-time", "30",
    "--dump-header", "-", "--output", "/dev/null", "--write-out", `\n${format}`,
    `${origin}${path}`,
  ])
  if (stderr) throw new Error(stderr)
  const lines = stdout.trimEnd().split("\n")
  const [status, ttfbSeconds, totalSeconds, bytes] = lines.pop().split(",")
  const headers = lines.join("\n")
  const header = (name) => headers.match(new RegExp(`^${name}:\\s*(.+)$`, "im"))?.[1] ?? null
  return {
    status: Number(status),
    ttfbMs: Math.round(Number(ttfbSeconds) * 1000),
    totalMs: Math.round(Number(totalSeconds) * 1000),
    bytes: Number(bytes),
    cacheControl: header("cache-control"),
    vercelCache: header("x-vercel-cache"),
    age: header("age"),
  }
}

const results = []
for (const path of routes) {
  for (let index = 0; index < samples; index += 1) {
    results.push({ path, sample: index + 1, ...(await sample(path)) })
    if (delayMs > 0) await new Promise((resolve) => setTimeout(resolve, delayMs))
  }
}

await mkdir(dirname(output), { recursive: true })
await writeFile(output, `${JSON.stringify({ origin, samples, capturedAt: new Date().toISOString(), results }, null, 2)}\n`)
console.log(`Wrote ${results.length} low-rate samples to ${output}`)
