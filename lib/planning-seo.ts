import { getPlanningAuthorityByCode, getPlanningAuthorityBySlug } from "@/lib/planning-authorities"
import {
  planningApplicationPath,
  planningReferenceFromSlug,
} from "@/lib/property-intelligence"

export const RECENT_PLANNING_SITEMAP_LIMIT = 5000
export const NOTABLE_PLANNING_SITEMAP_LIMIT = 50000

export type PlanningSitemapApplication = {
  id: string
  local_authority_code: string
  reference: string
  registration_date: string | null
  updated_at: string | null
}

export type PlanningSitemapEntry = {
  applicationId: string
  url: string
  lastModified?: Date
}

export type PlanningInspectionCandidate = {
  application_id: string
  local_authority_code: string
  reference: string
  cohort: "notable" | "recent-left" | "recent"
  first_seen_at: string
  last_inspected_at: string | null
}

export type SearchConsoleIndexStatus = {
  verdict?: string
  coverageState?: string
  robotsTxtState?: string
  indexingState?: string
  pageFetchState?: string
  lastCrawlTime?: string
  crawledAs?: string
  googleCanonical?: string
  userCanonical?: string
  sitemap?: string[]
  referringUrls?: string[]
}

export type SearchConsoleInspectionResponse = {
  inspectionResult?: {
    inspectionResultLink?: string
    indexStatusResult?: SearchConsoleIndexStatus
  }
}

export type NormalisedInspection = {
  verdict: string | null
  coverageState: string | null
  robotsTxtState: string | null
  indexingState: string | null
  pageFetchState: string | null
  lastCrawlTime: string | null
  crawledAs: string | null
  googleCanonical: string | null
  userCanonical: string | null
  sitemaps: string[]
  referringUrls: string[]
  inspectionResultLink: string | null
  isIndexed: boolean
  isDiscovered: boolean
}

export function normaliseSiteBaseUrl(value: string) {
  return value.trim().replace(/\/+$/, "")
}

export function buildPlanningSitemapEntries(
  applications: PlanningSitemapApplication[],
  baseUrl: string,
  excludedApplicationIds: ReadonlySet<string> = new Set()
): PlanningSitemapEntry[] {
  const normalisedBaseUrl = normaliseSiteBaseUrl(baseUrl)
  const seenUrls = new Set<string>()
  const entries: PlanningSitemapEntry[] = []

  for (const application of applications) {
    if (excludedApplicationIds.has(application.id)) continue
    const authority = getPlanningAuthorityByCode(application.local_authority_code)
    if (!authority) continue

    const url = `${normalisedBaseUrl}${planningApplicationPath(
      authority,
      application.reference
    )}`
    if (seenUrls.has(url)) continue
    seenUrls.add(url)

    const sourceModified = application.updated_at || application.registration_date
    entries.push({
      applicationId: application.id,
      url,
      ...(sourceModified ? { lastModified: new Date(sourceModified) } : {}),
    })
  }

  return entries
}

export function parsePlanningDetailUrl(value: string) {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    return null
  }

  const match = url.pathname.match(/^\/planning\/([^/]+)\/([^/]+)\/?$/)
  if (!match) return null

  const authority = getPlanningAuthorityBySlug(decodeURIComponent(match[1]))
  const reference = planningReferenceFromSlug(decodeURIComponent(match[2]))
  if (!authority || !reference) return null

  return {
    localAuthorityCode: authority.code,
    reference,
  }
}

export function normaliseInspectionResponse(
  response: SearchConsoleInspectionResponse
): NormalisedInspection {
  const result = response.inspectionResult
  const index = result?.indexStatusResult
  const verdict = cleanString(index?.verdict)
  const coverageState = cleanString(index?.coverageState)
  const lastCrawlTime = cleanString(index?.lastCrawlTime)
  const sitemaps = cleanStrings(index?.sitemap)
  const referringUrls = cleanStrings(index?.referringUrls)
  const isIndexed = verdict === "PASS"
  const isUnknownCoverage = /unknown to google|not available/i.test(coverageState || "")
  const isDiscovered =
    isIndexed ||
    Boolean(lastCrawlTime) ||
    sitemaps.length > 0 ||
    referringUrls.length > 0 ||
    Boolean(coverageState && !isUnknownCoverage)

  return {
    verdict,
    coverageState,
    robotsTxtState: cleanString(index?.robotsTxtState),
    indexingState: cleanString(index?.indexingState),
    pageFetchState: cleanString(index?.pageFetchState),
    lastCrawlTime,
    crawledAs: cleanString(index?.crawledAs),
    googleCanonical: cleanString(index?.googleCanonical),
    userCanonical: cleanString(index?.userCanonical),
    sitemaps,
    referringUrls,
    inspectionResultLink: cleanString(result?.inspectionResultLink),
    isIndexed,
    isDiscovered,
  }
}

export function selectInspectionSample(
  candidates: PlanningInspectionCandidate[],
  limit: number
) {
  if (limit <= 0) return []
  const queues = {
    notable: candidates.filter((candidate) => candidate.cohort === "notable"),
    "recent-left": candidates.filter(
      (candidate) => candidate.cohort === "recent-left"
    ),
    recent: candidates.filter((candidate) => candidate.cohort === "recent"),
  }
  const targets = {
    notable: Math.ceil(limit * 0.2),
    "recent-left": Math.ceil(limit * 0.3),
    recent: Math.max(0, limit - Math.ceil(limit * 0.2) - Math.ceil(limit * 0.3)),
  }
  const selected: PlanningInspectionCandidate[] = []
  const selectedIds = new Set<string>()

  for (const cohort of ["notable", "recent-left", "recent"] as const) {
    for (const candidate of queues[cohort].slice(0, targets[cohort])) {
      if (selectedIds.has(candidate.application_id)) continue
      selected.push(candidate)
      selectedIds.add(candidate.application_id)
    }
  }

  for (const candidate of candidates) {
    if (selected.length >= limit) break
    if (selectedIds.has(candidate.application_id)) continue
    selected.push(candidate)
    selectedIds.add(candidate.application_id)
  }

  return selected
}

export function renderSitemapXml(entries: PlanningSitemapEntry[]) {
  const rows = entries.map((entry) => {
    const lastModified = entry.lastModified
      ? `<lastmod>${escapeXml(entry.lastModified.toISOString())}</lastmod>`
      : ""
    return `<url><loc>${escapeXml(entry.url)}</loc>${lastModified}</url>`
  })

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...rows,
    "</urlset>",
  ].join("")
}

function cleanString(value: string | undefined) {
  const cleaned = value?.trim()
  return cleaned || null
}

function cleanStrings(values: string[] | undefined) {
  return (values || []).map((value) => value.trim()).filter(Boolean)
}

function escapeXml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;")
}
