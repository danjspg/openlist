import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

import {
  buildPlanningSitemapEntries,
  normaliseInspectionResponse,
  parsePlanningDetailUrl,
  PlanningInspectionCandidate,
  renderSitemapXml,
  selectInspectionSample,
} from "../lib/planning-seo"
import { planningReferenceSlug } from "../lib/property-intelligence"

async function source(path: string) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8")
}

test("planning sitemap entries are canonical, deduplicated, and excludable", () => {
  const applications = [
    {
      id: "first",
      local_authority_code: "CORKCOCO",
      reference: "24/1234",
      registration_date: "2026-08-01",
      updated_at: "2026-08-10T12:00:00Z",
    },
    {
      id: "duplicate-url",
      local_authority_code: "CORKCOCO",
      reference: "24/1234",
      registration_date: "2026-08-01",
      updated_at: null,
    },
    {
      id: "excluded",
      local_authority_code: "DUBLINCITY",
      reference: "WEB1000/26",
      registration_date: "2026-08-02",
      updated_at: null,
    },
    {
      id: "unknown-authority",
      local_authority_code: "UNKNOWN",
      reference: "1",
      registration_date: "2026-08-03",
      updated_at: null,
    },
  ]

  const entries = buildPlanningSitemapEntries(
    applications,
    "https://www.openlist.ie/",
    new Set(["excluded"])
  )
  assert.equal(entries.length, 1)
  assert.equal(
    entries[0].url,
    `https://www.openlist.ie/planning/cork/${planningReferenceSlug("24/1234")}`
  )
  assert.equal(entries[0].lastModified?.toISOString(), "2026-08-10T12:00:00.000Z")
})

test("planning detail URL parser rejects non-detail routes", () => {
  const slug = planningReferenceSlug("WEB1000/26")
  assert.deepEqual(
    parsePlanningDetailUrl(`https://www.openlist.ie/planning/dublin-city/${slug}`),
    { localAuthorityCode: "DUBLINCITY", reference: "WEB1000/26" }
  )
  assert.equal(parsePlanningDetailUrl("https://www.openlist.ie/planning/dublin-city"), null)
  assert.equal(parsePlanningDetailUrl("https://www.openlist.ie/planning/applications"), null)
  assert.equal(parsePlanningDetailUrl("not-a-url"), null)
})

test("inspection responses preserve states and derive transparent flags", () => {
  const indexed = normaliseInspectionResponse({
    inspectionResult: {
      inspectionResultLink: "https://search.google.com/example",
      indexStatusResult: {
        verdict: "PASS",
        coverageState: "Submitted and indexed",
        lastCrawlTime: "2026-08-17T12:00:00Z",
        sitemap: ["https://www.openlist.ie/sitemap.xml"],
      },
    },
  })
  assert.equal(indexed.isIndexed, true)
  assert.equal(indexed.isDiscovered, true)

  const unknown = normaliseInspectionResponse({
    inspectionResult: {
      indexStatusResult: {
        verdict: "NEUTRAL",
        coverageState: "URL is unknown to Google",
      },
    },
  })
  assert.equal(unknown.isIndexed, false)
  assert.equal(unknown.isDiscovered, false)
})

test("inspection sampling is stratified, bounded, and deduplicated", () => {
  function candidate(id: string, cohort: PlanningInspectionCandidate["cohort"]) {
    return {
      application_id: id,
      local_authority_code: "CORKCOCO",
      reference: id,
      cohort,
      first_seen_at: "2026-08-01T00:00:00Z",
      last_inspected_at: null,
    }
  }
  const selected = selectInspectionSample(
    [
      candidate("n1", "notable"),
      candidate("n1", "recent"),
      candidate("l1", "recent-left"),
      candidate("l2", "recent-left"),
      candidate("r1", "recent"),
      candidate("r2", "recent"),
    ],
    4
  )
  assert.equal(selected.length, 4)
  assert.equal(new Set(selected.map((row) => row.application_id)).size, 4)
  assert.ok(selected.some((row) => row.cohort === "notable"))
  assert.ok(selected.some((row) => row.cohort === "recent-left"))
  assert.ok(selected.some((row) => row.cohort === "recent"))
})

test("notable sitemap XML escapes values and remains standards-shaped", () => {
  const xml = renderSitemapXml([
    {
      applicationId: "one",
      url: "https://www.openlist.ie/planning/cork/a&b",
      lastModified: new Date("2026-08-10T12:00:00Z"),
    },
  ])
  assert.match(xml, /^<\?xml version="1\.0" encoding="UTF-8"\?>/)
  assert.match(xml, /xmlns="http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9"/)
  assert.match(xml, /a&amp;b/)
  assert.match(xml, /<lastmod>2026-08-10T12:00:00\.000Z<\/lastmod>/)
})

test("migration makes notable selection explicit and measurement idempotent", async () => {
  const migration = await source(
    "supabase/migrations/20260818120000_add_planning_seo_measurement.sql"
  )
  assert.match(migration, /planning_seo_notable[\s\S]*source text not null[\s\S]*reason text not null[\s\S]*evidence jsonb not null/i)
  assert.match(migration, /primary key \(application_id, inspected_on\)/i)
  assert.match(migration, /primary key \(application_id, data_date\)/i)
  assert.match(migration, /planning_applications_registration_reference_sitemap_idx/i)
  assert.match(migration, /on conflict \(application_id, cohort\) do update/i)
  assert.match(migration, /not exists[\s\S]*planning_seo_notable[\s\S]*n\.active/i)
  assert.match(migration, /order by p\.registration_date desc, p\.reference desc, p\.id desc/i)
  assert.match(migration, /order by n\.created_at, p\.local_authority_code, p\.reference, p\.id/i)
})

test("robots and cached routes expose the bounded priority-eligible notable sitemap", async () => {
  const [robots, route, planning, rootSitemap] = await Promise.all([
    source("app/robots.ts"),
    source("app/sitemaps/planning-notable.xml/route.ts"),
    source("lib/planning.ts"),
    source("app/sitemap.ts"),
  ])
  assert.match(robots, /\/sitemaps\/planning-notable\.xml/)
  assert.match(route, /revalidate = 86400/)
  assert.match(route, /stale-while-revalidate=604800/)
  assert.match(route, /renderSitemapXml/)
  assert.match(route, /NOTABLE_PLANNING_SITEMAP_LIMIT/)
  assert.match(planning, /openlist_planning_notable_sitemap/)
  assert.doesNotMatch(planning, /openlist_planning_notable_sitemap_year/)
  assert.doesNotMatch(rootSitemap, /getNotablePlanningSitemapApplications/)
})

test("classification migration preserves press enrichment and separates priority eligibility", async () => {
  const migration = await source(
    "supabase/migrations/20260828105549_add_planning_notable_classification_metadata.sql"
  )
  assert.match(migration, /notable_categories text\[\]/)
  assert.match(migration, /classification_reasons jsonb/)
  assert.match(migration, /classification_sources text\[\]/)
  assert.match(migration, /priority_eligible boolean not null default true/)
  assert.match(migration, /source = 'press'[\s\S]*array\['press'\]/)
  assert.match(migration, /where n\.active and n\.priority_eligible/)
  assert.match(migration, /openlist_planning_notable_reconciliation_candidates/)
  assert.match(migration, /p_full_window/)
  assert.match(migration, /p\.updated_at >= now\(\)/)
  assert.match(migration, /49999/)
  assert.match(migration, /openlist_planning_notable_description_candidates/)
  assert.match(migration, /interval '30 days'/)
  assert.match(migration, /least\(coalesce\(p_limit, 30\), 100\)/)
  assert.doesNotMatch(migration, /update public\.planning_applications/)
  assert.doesNotMatch(migration, /display_name\s*=/)
  assert.doesNotMatch(migration, /search_aliases\s*=/)
  assert.doesNotMatch(migration, /evidence\s*=/)
  assert.doesNotMatch(migration, /update public\.planning_applications/)
})
