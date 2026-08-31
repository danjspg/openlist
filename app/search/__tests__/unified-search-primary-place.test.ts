import { describe, expect, it } from "vitest"

import { rankPlaceSuggestions, selectUniqueExactPlaceSuggestion } from "@/lib/place-search"

describe("unified area search ranking", () => {
  it("ranks an exact dominant town ahead of tiny subareas", () => {
    const ranked = rankPlaceSuggestions("Carrigaline", [
      { areaLabel: "Carrigaline Middle", areaSlug: "carrigaline-middle", county: "Cork", salesCount: 3 },
      { areaLabel: "Carrigaline", areaSlug: "carrigaline", county: "Cork", salesCount: 536 },
      { areaLabel: "Carrigaline Castle", areaSlug: "carrigaline-castle", county: "Cork", salesCount: 1 },
    ])

    expect(ranked[0]).toMatchObject({ areaLabel: "Carrigaline", county: "Cork" })
    expect(selectUniqueExactPlaceSuggestion("Carrigaline", ranked)).toMatchObject({
      areaLabel: "Carrigaline",
      county: "Cork",
    })
  })
})
