import assert from "node:assert/strict"
import test from "node:test"
import { readFile } from "node:fs/promises"

async function source(path: string) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8")
}

test("homepage count copy never presents a failed count as zero", async () => {
  const ppr = await source("lib/ppr.ts")
  assert.match(ppr, /from\("ppr_national_snapshots"\)/)
  assert.match(ppr, /eq\("range_key", "all"\)/)
  assert.doesNotMatch(ppr, /select\("id", \{ count: "exact", head: true \}\)/)
  assert.match(ppr, /summary\.salesCount <= 0/)
  assert.match(ppr, /Search public property sales across Ireland\./)
  assert.match(ppr, /Intl\.NumberFormat\("en-IE"\)\.format\(summary\.salesCount\)/)
})

test("homepage uses neutral viewing-organiser wording", async () => {
  const homepage = await source("app/page.tsx")
  assert.match(homepage, /Viewing organiser/)
  assert.doesNotMatch(homepage, /Planning a purchase\?/)
})

test("national council ranking uses one database-side 12-month window and five items", async () => {
  const [page, migration] = await Promise.all([
    source("app/planning/applications/PlanningApplicationsPage.tsx"),
    source("supabase/migrations/20260812203000_add_planning_council_activity_window.sql"),
  ])

  assert.match(page, /councilActivityStats\.slice\(0, 5\)/)
  assert.match(migration, /max\(registration_date\) as period_end/i)
  assert.match(migration, /period_end - interval '12 months' \+ interval '1 day'/i)
  assert.match(migration, /p\.registration_date >= w\.period_start/i)
  assert.match(migration, /p\.registration_date <= w\.period_end/i)
  assert.doesNotMatch(migration, /CORKCOCO|Cork/i)
})

test("stale sold-price availability notices are removed", async () => {
  const files = await Promise.all([
    source("components/ppr/PprComparisonPageShell.tsx"),
    source("app/sold-prices/[county]/page.tsx"),
  ])
  const combined = files.join("\n")
  assert.doesNotMatch(combined, /Detailed sold-prices search is being updated/i)
  assert.doesNotMatch(combined, /sold-prices search.*(?:unavailable|temporary|updated|rebuilt)/i)
})

test("full-history controls and search copy use the recorded-history model", async () => {
  const [ppr, analytics, selector, hub, search] = await Promise.all([
    source("lib/ppr.ts"),
    source("lib/ppr-analytics.ts"),
    source("components/ppr/PprTimeRangeSelector.tsx"),
    source("app/sold-prices/page.tsx"),
    source("app/sold-prices/search/page.tsx"),
  ])
  const combined = [ppr, analytics, selector, hub, search].join("\n")

  assert.match(ppr, /label: "All recorded history"/)
  assert.match(combined, /Based on all recorded history available in OpenList/)
  assert.match(
    hub,
    /Search recorded sales for a specific area, from recent transactions to the full available history\./
  )
  assert.match(
    search,
    /Choose an area from the suggestions above to search recorded sale prices\./
  )
  assert.doesNotMatch(combined, /All Time|Based on all available records|recent recorded sales/i)
})

test("planning copy distinguishes available history, comparison, trend and latest-month periods", async () => {
  const [authorities, planning, authorityPage, detailPage] = await Promise.all([
    source("lib/planning-authorities.ts"),
    source("app/planning/applications/PlanningApplicationsPage.tsx"),
    source("app/planning/[authority]/page.tsx"),
    source("app/planning/[authority]/[reference]/page.tsx"),
  ])
  const combined = [authorities, planning, authorityPage, detailPage].join("\n")

  assert.doesNotMatch(authorities, /historyLabel|isDeepCoverage/)
  assert.match(planning, /Search Irish planning applications across available official history/)
  assert.match(authorityPage, /Search available recorded history of/)
  assert.match(planning, /Latest 12 months, using the same period nationally/)
  assert.match(planning, /Latest 12 completed registration months/)
  assert.match(planning, /latest-month measures use the latest registration month/)
  assert.doesNotMatch(
    combined,
    /three years|the latest year|current Irish planning applications|in this import|imported planning|imported local authorities/i
  )
})

test("planning details omit absent fields and use the full stored proposal", async () => {
  const detail = await source("app/planning/[authority]/[reference]/page.tsx")
  assert.match(detail, /const fullProposal = proposal\.original \?\? proposal\.display/)
  assert.match(detail, /\{fullProposal\}/)
  assert.match(detail, /if \(!shownValue\) return null/)
  assert.doesNotMatch(detail, /Not recorded in source/)
  assert.doesNotMatch(detail, /Proposal as supplied by the council/)
})

test("Terms page contains the supplied current service wording", async () => {
  const terms = await source("app/terms/page.tsx")
  assert.match(terms, /Last updated: 12 August 2026/)
  assert.match(terms, /OpenList is an independently operated property-information service/)
  assert.match(terms, /4\. OpenList Insights and Calculations/)
  assert.match(terms, /10\. Intellectual Property and Public Data/)
  assert.match(terms, /14\. Contact/)
  assert.doesNotMatch(terms, /Use of the platform is at your own risk/)
})
