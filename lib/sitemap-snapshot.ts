import type { MetadataRoute } from "next"
import { renderSitemapXml } from "@/lib/planning-seo"

export const SITEMAP_SNAPSHOT_VERSION = 1 as const

export type SitemapSnapshotName =
  | "root"
  | "planningNotable"
  | "soldPricesLocalities"
  | "planningLocalitiesPriority"
  | "planningLocalitiesExpanded"

export type SitemapSnapshotEntry = {
  path: string
  lastModified?: string
}

export type SitemapSnapshot = {
  generatedAt: string
  entries: SitemapSnapshotEntry[]
}

export type SitemapSnapshotSet = {
  version: typeof SITEMAP_SNAPSHOT_VERSION
  generatedAt: string
  planningLocalityUniverseSize: number
  sitemaps: Record<SitemapSnapshotName, SitemapSnapshot>
}

const SNAPSHOT_NAMES: SitemapSnapshotName[] = [
  "root",
  "planningNotable",
  "soldPricesLocalities",
  "planningLocalitiesPriority",
  "planningLocalitiesExpanded",
]

export function parseSitemapSnapshotSet(value: unknown): SitemapSnapshotSet {
  if (!value || typeof value !== "object") throw new Error("Sitemap snapshot is not an object")
  const candidate = value as Partial<SitemapSnapshotSet>
  if (candidate.version !== SITEMAP_SNAPSHOT_VERSION) throw new Error("Unsupported sitemap snapshot version")
  if (!isIsoDate(candidate.generatedAt)) throw new Error("Sitemap snapshot generatedAt is invalid")
  if (!Number.isInteger(candidate.planningLocalityUniverseSize) || Number(candidate.planningLocalityUniverseSize) < 1) {
    throw new Error("Planning locality universe size is invalid")
  }
  if (!candidate.sitemaps || typeof candidate.sitemaps !== "object") throw new Error("Sitemap snapshots are missing")

  for (const name of SNAPSHOT_NAMES) {
    const snapshot = candidate.sitemaps[name]
    if (!snapshot || !isIsoDate(snapshot.generatedAt) || !Array.isArray(snapshot.entries)) {
      throw new Error(`Sitemap snapshot ${name} is invalid`)
    }
    const seen = new Set<string>()
    for (const entry of snapshot.entries) {
      if (!entry || typeof entry.path !== "string" || !entry.path.startsWith("/") || entry.path.startsWith("//")) {
        throw new Error(`Sitemap snapshot ${name} contains an invalid path`)
      }
      if (seen.has(entry.path)) throw new Error(`Sitemap snapshot ${name} contains duplicate path ${entry.path}`)
      seen.add(entry.path)
      if (entry.lastModified !== undefined && !isIsoDate(entry.lastModified)) {
        throw new Error(`Sitemap snapshot ${name} contains an invalid lastModified value`)
      }
    }
  }

  const priority = new Set(candidate.sitemaps.planningLocalitiesPriority.entries.map((entry) => entry.path))
  const expanded = candidate.sitemaps.planningLocalitiesExpanded.entries
  if (expanded.some((entry) => priority.has(entry.path))) throw new Error("Planning locality sitemap tiers overlap")
  if (priority.size + expanded.length !== candidate.planningLocalityUniverseSize) {
    throw new Error("Planning locality snapshots do not cover the full locality universe")
  }

  return candidate as SitemapSnapshotSet
}

export function sitemapMetadataEntries(
  snapshot: SitemapSnapshot,
  baseUrl = publicSiteUrl()
): MetadataRoute.Sitemap {
  return snapshot.entries.map((entry) => ({
    url: `${normaliseBaseUrl(baseUrl)}${entry.path}`,
    ...(entry.lastModified ? { lastModified: entry.lastModified } : {}),
  }))
}

export function renderSitemapSnapshotXml(snapshot: SitemapSnapshot, baseUrl = publicSiteUrl()) {
  const normalisedBaseUrl = normaliseBaseUrl(baseUrl)
  return renderSitemapXml(snapshot.entries.map((entry) => ({
    applicationId: entry.path,
    url: `${normalisedBaseUrl}${entry.path}`,
    ...(entry.lastModified ? { lastModified: new Date(entry.lastModified) } : {}),
  })))
}

export function sitemapSnapshotResponse(snapshot: SitemapSnapshot, baseUrl = publicSiteUrl()) {
  return new Response(renderSitemapSnapshotXml(snapshot, baseUrl), {
    headers: {
      "content-type": "application/xml; charset=utf-8",
      "cache-control": "public, s-maxage=86400, stale-while-revalidate=604800",
      "x-openlist-sitemap-snapshot": snapshot.generatedAt,
    },
  })
}

export function publicSiteUrl() {
  return normaliseBaseUrl(process.env.NEXT_PUBLIC_SITE_URL || "https://www.openlist.ie")
}

function normaliseBaseUrl(value: string) {
  return value.replace(/\/+$/, "")
}

function isIsoDate(value: unknown): value is string {
  if (typeof value !== "string" || !value) return false
  return !Number.isNaN(Date.parse(value))
}
