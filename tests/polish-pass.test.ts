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

test("homepage avoids purchase-pressure wording while retaining neutral research framing", async () => {
  const homepage = await source("app/page.tsx")
  assert.match(homepage, /Research any property or area in Ireland/)
  assert.match(homepage, /PROPERTY RESEARCH FOR IRELAND/)
  assert.doesNotMatch(homepage, /Planning a purchase\?/)
})

test("national council ranking uses one database-side 12-month window and five items", async () => {
  const [page, migration] = await Promise.all([
    source("app/planning/applications/PlanningApplicationsPage.tsx"),
    source("supabase/migrations/20260812203000_add_planning_council_activity_window.sql"),
  ])

  assert.match(page, /dashboard\.councilActivityStats\)\.slice\(0, 5\)/)
  assert.match(page, /Council activity in a consistent national comparison window\./)
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
  assert.match(selector, /Based on all recorded history available in OpenList/)
  assert.match(hub, /Search a town, suburb or county to see recorded sales and local market context\./)
  assert.match(search, /Choose an area from the suggestions above to search recorded sale prices\./)
  assert.match(search, /all recorded history available in OpenList/)
  assert.doesNotMatch(combined, /All Time|Based on all available records|recent recorded sales/i)
})

test("planning copy distinguishes available history, comparison and completed-month periods", async () => {
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
  assert.match(planning, /Council activity in a consistent national comparison window\./)
  assert.match(planning, /Latest 12 completed registration months\./)
  assert.match(planning, /Current-month area, status and type breakdowns can be partial until the month closes\./)
  assert.doesNotMatch(
    combined,
    /three years|the latest year|current Irish planning applications|in this import|imported planning|imported local authorities/i
  )
})

test("public planning copy avoids pipeline terminology and locale-formats counts", async () => {
  const [planning, results] = await Promise.all([
    source("app/planning/applications/PlanningApplicationsPage.tsx"),
    source("components/planning/PlanningResultsView.tsx"),
  ])
  const visibleCopy = [planning, results]
    .join("\n")
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("import "))
    .join("\n")

  assert.doesNotMatch(
    visibleCopy,
    /in this import|imported planning|ingestion|records loaded|source payload|dataset row|refresh cohort/i
  )
  assert.match(planning, /formatPlanningCount\(dashboard\.searchCount\)/)
  assert.match(planning, /typeof value === "number" \? formatPlanningCount\(value\) : value/)
  assert.match(planning, /formatPlanningCount\(stat\.count\)/)
  assert.match(results, /toLocaleString\("en-IE"\)/)
})

test("planning details separate a concise heading from the full stored proposal", async () => {
  const detail = await source("app/planning/[authority]/[reference]/page.tsx")
  assert.match(detail, /const proposalTitle = planningProposalTitle\(/)
  assert.match(detail, /\{proposalTitle\}/)
  assert.match(detail, /Proposal description/)
  assert.match(detail, /<ProposalDescription[\s\S]*value=\{fullProposal\}/)
  assert.match(detail, /description: fullProposal/)
  assert.match(detail, /if \(!shownValue\) return null/)
  assert.doesNotMatch(detail, /Not recorded in source/)
  assert.match(detail, /<h1[^>]*>[\s\S]*?\{proposalTitle\}[\s\S]*?<\/h1>/)
  assert.doesNotMatch(detail, /<h1[^>]*>[\s\S]*?\{fullProposal\}[\s\S]*?<\/h1>/)
})

test("planning result surfaces keep concise, visually clamped titles and proposal copy", async () => {
  const [planningResult, unifiedSearch] = await Promise.all([
    source("components/planning/PlanningApplicationResult.tsx"),
    source("app/search/page.tsx"),
  ])

  assert.match(planningResult, /line-clamp-2 text-xl/)
  assert.match(planningResult, /showProposal \? <p className="mt-3 line-clamp-2 text-sm leading-6/)
  assert.match(unifiedSearch, /planningProposalTitle\(application\.proposal/)
  assert.match(unifiedSearch, /className="mt-2 line-clamp-3/)
})

test("sold-price locality keeps polished sale cards and a lightweight Planning crossover", async () => {
  const [saleCard, soldPriceArea] = await Promise.all([
    source("components/ppr/PprSaleCard.tsx"),
    source("app/sold-prices/[county]/[areaSlug]/page.tsx"),
  ])

  assert.match(saleCard, /View area prices/)
  assert.match(saleCard, /bg-emerald-700/)
  assert.match(saleCard, /min-h-10/)
  assert.match(soldPriceArea, /<PprSaleCard key=\{sale\.id\}/)
  assert.match(soldPriceArea, /const planningHref = `\/planning\/applications\?area=/)
  assert.match(soldPriceArea, /View Planning in \{areaName\} →/)
  assert.doesNotMatch(soldPriceArea, /planningResultRecord\(application\)/)
})

test("planning page remains useful when aggregate statistics time out", async () => {
  const [planningData, planningPage] = await Promise.all([
    source("lib/planning.ts"),
    source("app/planning/applications/PlanningApplicationsPage.tsx"),
  ])

  assert.match(planningData, /aggregateAvailable:[\s\S]*overviewResult !== null/)
  assert.match(planningData, /Planning dashboard snapshot unavailable; optional metrics omitted/)
  assert.match(planningPage, /Planning statistics are temporarily unavailable/)
  assert.match(planningPage, /Recent applications and search remain available/)
  assert.match(planningData, /getRecentPlanningApplicationsCached/)
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
