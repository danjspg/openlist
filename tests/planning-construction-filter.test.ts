import assert from "node:assert/strict"
import test from "node:test"
import { readFile } from "node:fs/promises"
import { buildPlanningFilterFields } from "../lib/planning-filters"

async function normalisePlanningSearchParams(params: Record<string, string>) {
  process.env.NEXT_PUBLIC_SUPABASE_URL ||= "http://localhost:54321"
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||= "test-anon-key"
  const planning = await import("../lib/planning")
  return planning.normalisePlanningSearchParams(params)
}

test("construction filter URL state normalises and composes with existing filters", async () => {
  const filters = await normalisePlanningSearchParams({
    q: "housing",
    area: "Drogheda",
    council: "Louth",
    status: "Granted",
    type: "Permission",
    construction: "commenced",
    sort: "oldest",
  })
  assert.equal(filters.construction, "commenced")
  assert.deepEqual(buildPlanningFilterFields(filters, "status", "Appealed"), {
    q: "housing",
    area: "Drogheda",
    council: "Louth",
    status: "Appealed",
    type: "Permission",
    construction: "commenced",
    sort: "oldest",
  })
  assert.equal(new URLSearchParams(Object.entries(buildPlanningFilterFields(filters, "status", "Appealed"))).get("construction"), "commenced")
})

test("only the verified commenced construction state is accepted", async () => {
  assert.equal((await normalisePlanningSearchParams({ construction: "completed" })).construction, "")
  assert.equal((await normalisePlanningSearchParams({ construction: "yes" })).construction, "")
  assert.equal((await normalisePlanningSearchParams({ construction: "commenced" })).construction, "commenced")
})

test("search and locality controls use the same shareable construction dimension", async () => {
  const [planning, searchPage, localityPage, migration] = await Promise.all([
    readFile(new URL("../lib/planning.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/planning/applications/PlanningApplicationsPage.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/planning/[authority]/areas/[areaSlug]/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../supabase/migrations/20260830092123_add_incremental_bcms_pipeline.sql", import.meta.url), "utf8"),
  ])
  assert.match(planning, /query = query\.eq\("construction_status", "commenced"\)/)
  assert.match(searchPage, /name="construction"[\s\S]*value="commenced"[\s\S]*Construction commenced/)
  assert.match(localityPage, /localitySearchHref\(authority\.slug, locality, undefined, "commenced"\)/)
  assert.match(localityPage, /Construction commenced in \{locality\}/)
  assert.match(migration, /where construction_status = 'commenced'/)
})
