import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { rankPlaceSuggestions, selectUniqueExactPlaceSuggestion } from "@/lib/place-search"

describe("unified area search ranking", () => {
  it("ranks an exact dominant town ahead of tiny subareas", () => {
    const ranked = rankPlaceSuggestions("Carrigaline", [
      { areaLabel: "Carrigaline Middle", areaSlug: "carrigaline-middle", county: "Cork", salesCount: 3, lastSaleDate: null },
      { areaLabel: "Carrigaline", areaSlug: "carrigaline", county: "Cork", salesCount: 536, lastSaleDate: null },
      { areaLabel: "Carrigaline Castle", areaSlug: "carrigaline-castle", county: "Cork", salesCount: 1, lastSaleDate: null },
    ])

    assert.deepEqual({ areaLabel: ranked[0]?.areaLabel, county: ranked[0]?.county }, { areaLabel: "Carrigaline", county: "Cork" })
    const exact = selectUniqueExactPlaceSuggestion("Carrigaline", ranked)
    assert.deepEqual({ areaLabel: exact?.areaLabel, county: exact?.county }, {
      areaLabel: "Carrigaline",
      county: "Cork",
    })
  })
})
