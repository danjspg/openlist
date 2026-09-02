import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

async function source(path: string) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8")
}

test("ISR Planning authority pages contain the search-param client view within Suspense", async () => {
  const [authorityPage, applicationsPage, resultsView] = await Promise.all([
    source("app/planning/[authority]/page.tsx"),
    source("app/planning/applications/PlanningApplicationsPage.tsx"),
    source("components/planning/PlanningResultsView.tsx"),
  ])

  assert.match(resultsView, /useSearchParams\(\)/)
  assert.match(applicationsPage, /import \{ Suspense \} from "react"/)
  assert.match(
    applicationsPage,
    /<Suspense[\s\S]*<PlanningResultsView applications=\{planningResults\} \/>[\s\S]*<\/Suspense>/,
  )
  assert.match(authorityPage, /export const revalidate = 21600/)
  assert.doesNotMatch(authorityPage, /force-dynamic/)
})
