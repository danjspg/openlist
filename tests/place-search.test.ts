import assert from "node:assert/strict"
import test from "node:test"
import {
  classifyUnifiedSearchIntent,
  rankAddressResults,
  rankPlaceSuggestions,
} from "../lib/place-search"
import type { PprSearchAreaOption } from "../lib/ppr"

function area(
  areaLabel: string,
  salesCount: number,
  county = "Cork"
): PprSearchAreaOption {
  return {
    county,
    areaSlug: areaLabel.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""),
    areaLabel,
    salesCount,
    lastSaleDate: null,
  }
}

test("clear localities rank above low-volume street fragments", () => {
  const ranked = rankPlaceSuggestions("Carrigaline", [
    area("Carrigaline Rd", 3),
    area("Carrigaline", 228),
    area("Carrigaline Road", 1),
    area("Carrigaline Road Ardarrig", 1),
  ])

  assert.equal(ranked[0]?.areaLabel, "Carrigaline")
  assert.deepEqual(ranked.map((item) => item.areaLabel), ["Carrigaline"])
})

test("common street suffix variants are deduplicated and demoted", () => {
  const ranked = rankPlaceSuggestions("Douglas", [
    area("Douglas", 500),
    area("Douglas Rd", 2),
    area("Douglas Road", 4),
    area("Douglas Street", 1),
    area("Douglas Terrace", 2),
  ])

  assert.deepEqual(ranked.map((item) => item.areaLabel), ["Douglas"])
})

test("established places with place-like suffixes remain eligible", () => {
  const ranked = rankPlaceSuggestions("Phoenix Park", [
    area("Phoenix", 400, "Dublin"),
    area("Phoenix Park", 120, "Dublin"),
    area("Phoenix Park Road", 2, "Dublin"),
  ])

  assert.equal(ranked[0]?.areaLabel, "Phoenix Park")
  assert.equal(ranked.some((item) => item.areaLabel === "Phoenix Park Road"), false)
})

test("search intent distinguishes references, Eircodes, addresses and areas", () => {
  assert.equal(classifyUnifiedSearchIntent("26/1638"), "planning-reference")
  assert.equal(classifyUnifiedSearchIntent("T45 PX70"), "eircode")
  assert.equal(classifyUnifiedSearchIntent("12 Main Street, Carrigaline"), "address")
  assert.equal(classifyUnifiedSearchIntent("Carrigaline"), "area")
})

test("contiguous address matches rank above records with scattered matching words", () => {
  const sale = (id: string, addressRaw: string, date: string) => ({
    id,
    address_raw: addressRaw,
    address_normalised: addressRaw.toUpperCase(),
    date_of_sale: date,
    price_eur: 300_000,
  })
  const ranked = rankAddressResults("2 Johnstown Park", [
    sale("newer", "2 The Park, Cois Glaisin, Johnstown, Navan", "2026-08-01"),
    sale("target", "2 Johnstown Park, Glounthaune, Cork", "2025-11-14"),
    sale("other", "2 St Johns Park South, St Johns Grove, Johnstown", "2026-07-01"),
  ])

  assert.equal(ranked[0]?.id, "target")
})
