import { rename, writeFile } from "node:fs/promises"
import { resolve } from "node:path"

const baseUrl = (process.env.NEXT_PUBLIC_SITE_URL || "https://www.openlist.ie").replace(/\/+$/, "")
const generatedAt = new Date().toISOString()
const sources = {
  root: "/sitemap.xml",
  planningNotable: "/sitemaps/planning-notable.xml",
  soldPricesLocalities: "/sitemaps/sold-prices-localities.xml",
  planningLocalitiesPriority: "/sitemaps/planning-localities.xml",
  planningLocalitiesExpanded: "/sitemaps/planning-localities-expanded.xml",
}

const sitemaps = {}
for (const [name, path] of Object.entries(sources)) {
  const response = await fetch(`${baseUrl}${path}`, {
    headers: { accept: "application/xml" },
    signal: AbortSignal.timeout(20_000),
  })
  if (!response.ok) throw new Error(`${path} returned HTTP ${response.status}`)
  const entries = parseSitemap(await response.text())
  if (entries.length === 0) throw new Error(`${path} returned an empty sitemap`)
  sitemaps[name] = { generatedAt, entries }
}

const priority = new Set(sitemaps.planningLocalitiesPriority.entries.map((entry) => entry.path))
if (sitemaps.planningLocalitiesExpanded.entries.some((entry) => priority.has(entry.path))) {
  throw new Error("Published Planning locality sitemap tiers overlap")
}
const planningLocalityUniverseSize = priority.size + sitemaps.planningLocalitiesExpanded.entries.length
if (planningLocalityUniverseSize < 2000) throw new Error(`Published Planning locality universe is unexpectedly small: ${planningLocalityUniverseSize}`)

const snapshot = { version: 1, generatedAt, planningLocalityUniverseSize, sitemaps }
const target = resolve("data/sitemap-snapshots.json")
const temporary = resolve("data/.sitemap-snapshots-seed.tmp")
await writeFile(temporary, `${JSON.stringify(snapshot)}\n`, "utf8")
await rename(temporary, target)
console.log(JSON.stringify({ generatedAt, planningLocalityUniverseSize, counts: Object.fromEntries(Object.entries(sitemaps).map(([name, value]) => [name, value.entries.length])) }, null, 2))

function parseSitemap(xml) {
  const entries = []
  for (const match of xml.matchAll(/<url>([\s\S]*?)<\/url>/g)) {
    const location = match[1].match(/<loc>([\s\S]*?)<\/loc>/)?.[1]
    if (!location) continue
    const lastModified = match[1].match(/<lastmod>([\s\S]*?)<\/lastmod>/)?.[1]
    const path = new URL(decodeXml(location.trim())).pathname
    entries.push({ path, ...(lastModified ? { lastModified: new Date(decodeXml(lastModified.trim())).toISOString() } : {}) })
  }
  return [...new Map(entries.map((entry) => [entry.path, entry])).values()]
}

function decodeXml(value) {
  return value.replaceAll("&amp;", "&").replaceAll("&lt;", "<").replaceAll("&gt;", ">").replaceAll("&quot;", '"').replaceAll("&apos;", "'")
}
