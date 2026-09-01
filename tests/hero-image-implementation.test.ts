import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const expectedDimensions = { width: 1448, height: 1086 }

async function pngDimensions(path: string) {
  const image = await readFile(path)

  return {
    width: image.readUInt32BE(16),
    height: image.readUInt32BE(20),
  }
}

test("Homepage and Planning use the selected production hero assets directly", async () => {
  const [homepage, planning, globalCss] = await Promise.all([
    readFile("app/page.tsx", "utf8"),
    readFile("app/planning/applications/PlanningApplicationsPage.tsx", "utf8"),
    readFile("app/globals.css", "utf8"),
  ])

  assert.equal(homepage.match(/openlist-home-selected-final\.png/g)?.length, 1)
  assert.equal(planning.match(/openlist-planning-selected-final\.png/g)?.length, 1)
  assert.match(homepage, /<Image[^>]*src="\/openlist-home-selected-final\.png"/)
  assert.match(planning, /src="\/openlist-planning-selected-final\.png"/)
  assert.match(homepage, /sizes="\(max-width: 1023px\) calc\(100vw - 2rem\), 42vw"/)
  assert.match(planning, /sizes="\(max-width: 1023px\) calc\(100vw - 2rem\), 42vw"/)

  assert.doesNotMatch(globalCss, /openlist-(?:home|planning)-selected-final/)
  assert.doesNotMatch(globalCss, /planning-explore-heading/)
  assert.doesNotMatch(homepage, /home-(?:hero|planning)-/)
})

test("selected hero assets retain their full source dimensions", async () => {
  const [homepage, planning] = await Promise.all([
    pngDimensions("public/openlist-home-selected-final.png"),
    pngDimensions("public/openlist-planning-selected-final.png"),
  ])

  assert.deepEqual(homepage, expectedDimensions)
  assert.deepEqual(planning, expectedDimensions)
})

test("Sold Prices keeps its existing hero asset path", async () => {
  const globalCss = await readFile("app/globals.css", "utf8")

  assert.match(globalCss, /background-image: url\("\/home-modern-irish-street\.jpg"\)/)
})
