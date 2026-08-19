import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const searchPage = readFile(
  new URL("../app/search/page.tsx", import.meta.url),
  "utf8"
)

test("generic search tracks populated categories and total rows", async () => {
  const source = await searchPage

  assert.match(source, /const hasPlaces = results\.places\.length > 0/)
  assert.match(source, /const hasAddresses = results\.addresses\.length > 0/)
  assert.match(source, /const hasPlanning = results\.planningApplications\.length > 0/)
  assert.match(source, /const hasResults = resultCount > 0/)
  assert.match(
    source,
    /results\.places\.length \+ results\.addresses\.length \+ results\.planningApplications\.length/
  )
})

test("planning-only generic search renders planning without empty Places or sold-price sections", async () => {
  const source = await searchPage

  assert.match(source, /\{hasPlanning \? \([\s\S]*?<ResultSection title="Planning applications"/)
  assert.match(source, /\{hasPlaces \? \(/)
  assert.match(source, /\{hasAddresses \? \(/)
})

test("places-only and address-only searches use their own populated section", async () => {
  const source = await searchPage

  assert.match(source, /\{hasPlaces \? \([\s\S]*?<ResultSection title="Places"/)
  assert.match(source, /\{hasAddresses \? \([\s\S]*?<ResultSection\s+title=\{results\.intent/)
})

test("populated generic sections preserve Places, addresses, planning order", async () => {
  const source = await searchPage
  const places = source.indexOf("{hasPlaces ? (")
  const addresses = source.indexOf("{hasAddresses ? (")
  const planning = source.indexOf("{hasPlanning ? (")

  assert.ok(places < addresses)
  assert.ok(addresses < planning)
})

test("zero-result generic search renders one unified, restrained empty state", async () => {
  const source = await searchPage

  assert.match(source, /\{hasResults \? \(/)
  assert.match(source, /No results found for “\{query\}”/)
  assert.match(
    source,
    /Try an address, area, Eircode, planning reference, applicant or proposal keyword\./
  )
  assert.match(source, /rounded-2xl border border-stone-200 bg-white[^\n]*shadow-sm/)
})

test("result count does not include empty categories and uses concise copy", async () => {
  const source = await searchPage

  assert.match(source, /\{resultCount\} result\{resultCount === 1 \? "" : "s"\} for “\{query\}”/)
  assert.doesNotMatch(source, /result\{resultCount === 1 \? "" : "s"\} shown for/)
})

test("Eircode result sections retain explicit empty-state support", async () => {
  const source = await searchPage

  assert.match(source, /<EircodeResults results=\{results\} label=\{resultLabel\} \/>/)
  assert.match(source, /<ResultSection title="Exact sold-price records" empty=/)
  assert.match(source, /<ResultSection title="Exact planning records" empty=/)
  assert.match(source, /function ResultSection\(\{ title, empty, children \}/)
})

test("PlanningRow remains a canonical planning detail Link", async () => {
  const source = await searchPage

  assert.match(source, /const href = authority \? planningApplicationPath\(authority, application\.reference\) : "\/planning"/)
  assert.match(source, /return \([\s\S]*?<Link href=\{href\}/)
})
