import test from "node:test"
import assert from "node:assert/strict"
import {
  classifyPlanningNotability,
  DEFAULT_PLANNING_NOTABLE_THRESHOLDS,
  extractPlanningScaleSignals,
  PUBLIC_PLANNING_CATEGORY_SLUGS,
} from "../lib/planning-notable-classifier.mjs"
import {
  evaluatePlanningNotableEligibility,
  planningNotableRetentionCutoff,
} from "../lib/planning-notable-eligibility.mjs"
import {
  buildDeterministicNotableMutation,
  classifyAndPersistPlanningApplications,
  mergePressNotableMetadata,
} from "../lib/planning-notable-persistence.mjs"

const application = (proposal, overrides = {}) => ({
  id: overrides.id || "00000000-0000-0000-0000-000000000001",
  local_authority_code: "CORKCOCO",
  reference: "26/1",
  proposal,
  applicant_name: overrides.applicant_name || "Example Applicant Limited",
  application_type: overrides.application_type || "Permission",
  ...overrides,
})

const positiveCases = [
  ["6-turbine wind farm", "Development of a 6 turbine wind farm and grid connection", "energy"],
  ["solar farm", "A 45 hectare solar farm with associated infrastructure", "energy"],
  ["BESS facility", "Construction of a 100MW battery energy storage system (BESS) facility", "energy"],
  ["data centre", "Construction of a three-building data centre campus", "data-centre"],
  ["supermarket", "Construction of a new supermarket and car park", "retail"],
  ["Lidl store", "Construction of a new food store and associated works", "retail", { applicant_name: "Lidl Ireland GmbH" }],
  ["hotel", "Construction of a new 145-bedroom hotel", "hospitality"],
  ["drive-through restaurant", "Development of a drive-through restaurant and access road", "hospitality"],
  ["railway station", "A new railway station with platforms and pedestrian bridge", "transport"],
  ["large factory", "Construction of a major manufacturing plant and factory building", "industrial"],
  ["120-home development", "Development of 120 homes, roads and public open space", "residential-large"],
  ["300-bed student accommodation", "Construction of a 300-bed student accommodation development", "student-accommodation"],
  ["major business park", "Development of a major business park comprising six commercial buildings", "commercial"],
]

for (const [name, proposal, category, overrides] of positiveCases) {
  test(`classifies ${name}`, () => {
    const result = classifyPlanningNotability(application(proposal, overrides))
    assert.equal(result.notable, true)
    assert.ok(result.categories.includes(category), `${category} missing from ${JSON.stringify(result)}`)
    assert.ok(result.reasons.length > 0)
  })
}

const negativeCases = [
  "Installation of an illuminated fascia sign to the existing supermarket",
  "Minor shopfront alterations to an existing retail unit",
  "Construction of a single-storey extension to the rear of a dwelling",
  "Retention permission for minor signage at the service station",
  "Internal office alterations only within an industrial estate",
  "A small domestic change to a previously approved house",
  "Minor amendment to a previously approved hotel application",
]

for (const proposal of negativeCases) {
  test(`does not classify minor case: ${proposal}`, () => {
    const result = classifyPlanningNotability(application(proposal))
    assert.equal(result.notable, false, JSON.stringify(result))
    assert.deepEqual(result.categories, [])
  })
}

test("strong major-project signals override incidental exclusion wording", () => {
  const result = classifyPlanningNotability(application(
    "Construction of 120 homes, a new supermarket, illuminated signage and associated road works"
  ))
  assert.equal(result.notable, true)
  assert.ok(result.categories.includes("residential-large"))
  assert.ok(result.categories.includes("retail"))
  assert.ok(result.signals.exclusions.includes("minor.signage"))
  assert.equal(result.signals.exclusionApplied, false)
})

test("residential thresholds are configurable and centralised", () => {
  assert.equal(DEFAULT_PLANNING_NOTABLE_THRESHOLDS.residentialUnits, 10)
  assert.equal(DEFAULT_PLANNING_NOTABLE_THRESHOLDS.largeResidentialUnits, 50)
  assert.equal(DEFAULT_PLANNING_NOTABLE_THRESHOLDS.studentAccommodationUnits, 50)
  assert.equal(classifyPlanningNotability(application("Development of 9 dwellings")).notable, false)
  assert.equal(classifyPlanningNotability(application("Development of 9 dwellings"), {
    thresholds: { residentialUnits: 9 },
  }).notable, true)
})

test("explicit residential totals win over component counts", () => {
  for (const proposal of [
    "Construction of 41 units comprising of: 23no. 3-Bed Terrace House Units and 18no. apartment units",
    "Development of 41 no. units comprising 23 houses and 18 apartments",
    "Development of 41 residential units comprising: 23 houses; 18 apartments",
  ]) {
    const signals = extractPlanningScaleSignals(proposal)
    assert.equal(signals.residentialUnits, 41, proposal)
    assert.equal(signals.explicitResidentialUnits, 41, proposal)
  }
})

test("a validated scheme total is not overridden by a larger referenced component", () => {
  const signals = extractPlanningScaleSignals(
    "Development of 41 residential units comprising 23 houses and 18 apartments, beside 60 apartments previously approved on adjoining lands"
  )
  assert.equal(signals.explicitResidentialUnits, 41)
  assert.equal(signals.componentResidentialUnits, 60)
  assert.equal(signals.residentialUnits, 41)
})

test("historical amendment counts are not treated as resulting scheme totals", () => {
  const signals = extractPlanningScaleSignals(
    "Amendments to previously approved development of 120 units comprising the omission of 8 apartments and reconfiguration of parking"
  )
  assert.equal(signals.explicitResidentialUnits, 0)
  assert.equal(signals.residentialUnits, 8)
})

for (const [units, expectedCategory] of [[9, null], [10, "residential"], [49, "residential"], [50, "residential-large"], [99, "residential-large"], [100, "residential-large"]]) {
  test(`${units} residential units use the expected public category`, () => {
    const result = classifyPlanningNotability(application(`Development of ${units} dwellings`))
    assert.equal(result.categories.find((category) => category.startsWith("residential")) || null, expectedCategory)
    assert.equal(result.signals.residentialUnits, units)
  })
}

test("classifier output is deterministic and idempotent", () => {
  const row = application("A 120-home development with a new railway station")
  assert.deepEqual(classifyPlanningNotability(row), classifyPlanningNotability({ ...row }))
})

const publicCategoryCases = [
  ["padel", "Construction of four covered padel courts and a padel clubhouse"],
  ["residential-development", "Development of 24 dwellings"],
  ["large-residential", "Development of 120 homes"],
  ["wind-farms", "Development of a six-wind-turbine wind farm"],
  ["solar-energy", "Development of a 45 hectare solar farm"],
  ["battery-storage", "A 100MW battery energy storage system facility"],
  ["retail", "Construction of a new supermarket"],
  ["hotels-restaurants", "Construction of a new 145-bedroom hotel"],
  ["student-accommodation", "Construction of 300 student accommodation bedspaces"],
  ["data-centres", "Construction of a three-building data centre campus"],
  ["infrastructure", "Construction of a 110kV electricity substation"],
  ["transport", "Construction of a new railway station"],
  ["industrial-logistics", "Construction of a major logistics distribution centre"],
  ["waste-recycling", "Development of a materials recovery facility"],
  ["quarrying", "Extension of an existing quarry for rock extraction"],
]

test("one canonical classifier owns every public category", () => {
  assert.deepEqual(publicCategoryCases.map(([slug]) => slug), PUBLIC_PLANNING_CATEGORY_SLUGS)
  for (const [slug, proposal] of publicCategoryCases) {
    const result = classifyPlanningNotability(application(proposal))
    assert.ok(result.publicCategories.includes(slug), `${slug} missing from ${JSON.stringify(result)}`)
  }
})

test("public category rules reject incidental Padel, road and substation references", () => {
  for (const proposal of [
    "Construction of one dwelling at Padel Road",
    "Construction of one dwelling and a new entrance from the regional road",
    "A restaurant extension including relocation of the existing electricity substation kiosk",
  ]) {
    assert.deepEqual(classifyPlanningNotability(application(proposal)).publicCategories, [], proposal)
  }
})

const eligibilityAsOf = "2026-08-28"

for (const [name, proposal] of [
  ["wind farm", "Development of a 6 turbine wind farm"],
  ["supermarket", "Construction of a new supermarket"],
  ["120-home scheme", "Development of 120 homes"],
]) {
  test(`active ${name} is priority eligible`, () => {
    const row = application(proposal, { normalized_status: "under_assessment" })
    const classification = classifyPlanningNotability(row)
    const eligibility = evaluatePlanningNotableEligibility(row, null, {
      structurallyNotable: classification.notable,
      asOf: eligibilityAsOf,
    })
    assert.equal(eligibility.priorityEligible, true)
    assert.equal(eligibility.reason, "active-structural")
  })
}

for (const [monthsAgo, decisionDate, expected] of [
  [3, "2026-05-28", true],
  [11, "2025-09-28", true],
  [13, "2025-07-28", false],
]) {
  test(`structurally notable decision ${monthsAgo} months ago has expected eligibility`, () => {
    const row = application("Development of a 6 turbine wind farm", {
      normalized_status: "final_grant",
      decision_date: decisionDate,
    })
    const eligibility = evaluatePlanningNotableEligibility(row, null, {
      structurallyNotable: true,
      asOf: eligibilityAsOf,
    })
    assert.equal(eligibility.priorityEligible, expected)
  })
}

test("retention uses the latest meaningful outcome and a configurable month cutoff", () => {
  assert.equal(planningNotableRetentionCutoff(eligibilityAsOf, 12), "2025-08-28")
  assert.equal(planningNotableRetentionCutoff("2026-08-31", 6), "2026-02-28")
  const eligibility = evaluatePlanningNotableEligibility({
    normalized_status: "appeal_decided",
    decision_date: "2024-01-01",
    appeal_decision_date: "2026-01-01",
  }, null, { structurallyNotable: true, asOf: eligibilityAsOf })
  assert.equal(eligibility.latestOutcomeDate, "2026-01-01")
  assert.equal(eligibility.priorityEligible, true)
})

for (const [units, decisionDate, expected, months] of [
  [10, "2025-08-28", true, 12],
  [10, "2025-08-27", false, 12],
  [50, "2024-08-28", true, 24],
  [50, "2024-08-27", false, 24],
  [100, "2021-08-28", true, 60],
  [100, "2021-08-27", false, 60],
]) {
  test(`${units}-unit retention boundary is ${months} months`, () => {
    const eligibility = evaluatePlanningNotableEligibility({
      normalized_status: "final_grant",
      decision_date: decisionDate,
    }, null, { structurallyNotable: true, residentialUnits: units, asOf: eligibilityAsOf })
    assert.equal(eligibility.priorityEligible, expected)
    assert.equal(eligibility.retentionMonths, months)
  })
}

test("active residential applications override an expired scale window", () => {
  const eligibility = evaluatePlanningNotableEligibility({
    normalized_status: "under_assessment",
    decision_date: "2018-01-01",
  }, null, { structurallyNotable: true, residentialUnits: 10, asOf: eligibilityAsOf })
  assert.equal(eligibility.priorityEligible, true)
  assert.equal(eligibility.reason, "active-structural")
})

test("latest meaningful lifecycle event extends retention", () => {
  const eligibility = evaluatePlanningNotableEligibility({
    normalized_status: "final_grant",
    decision_date: "2020-01-01",
    latest_lifecycle_event_date: "2026-01-15",
  }, null, { structurallyNotable: true, residentialUnits: 10, asOf: eligibilityAsOf })
  assert.equal(eligibility.latestOutcomeDate, "2026-01-15")
  assert.equal(eligibility.priorityEligible, true)
})

test("old structural classification expires unless press or manual metadata overrides it", () => {
  const row = application("Development of a 6 turbine wind farm", {
    normalized_status: "final_grant",
    decision_date: "2020-01-01",
  })
  const oldStructural = buildDeterministicNotableMutation(row, null, undefined, { asOf: eligibilityAsOf })
  assert.equal(oldStructural.row.active, true)
  assert.equal(oldStructural.row.priority_eligible, false)
  assert.ok(oldStructural.row.classification_reasons.deterministic)
  assert.ok(oldStructural.row.notable_categories.includes("energy"))

  const withPress = mergePressNotableMetadata(oldStructural.row, {
    applicationId: row.id,
    evidence: { stories: [{ url: "https://publisher.example/old-wind-farm" }] },
  })
  assert.equal(withPress.priority_eligible, true)
  const rerun = buildDeterministicNotableMutation(row, withPress, undefined, { asOf: eligibilityAsOf })
  assert.equal(rerun.row.priority_eligible, true)
  assert.deepEqual(rerun.row.classification_sources, ["deterministic", "press"])
})

test("deterministic and press metadata coexist without losing enrichment", () => {
  const row = application("Development of 120 homes")
  const deterministic = buildDeterministicNotableMutation(row, null)
  deterministic.row.evidence = { description_audit: { outcome: "complete" } }
  const withPress = mergePressNotableMetadata(deterministic.row, {
    applicationId: row.id,
    displayName: "Riverbank Quarter",
    searchAliases: ["Riverbank Quarter"],
    evidence: { stories: [{ url: "https://publisher.example/story" }] },
  })
  assert.deepEqual(withPress.classification_sources, ["deterministic", "press"])
  assert.ok(withPress.notable_categories.includes("residential-large"))
  assert.ok(withPress.notable_categories.includes("large-residential"))
  assert.ok(withPress.notable_categories.includes("press"))
  assert.ok(withPress.classification_reasons.deterministic)
  assert.ok(withPress.classification_reasons.press)
  assert.equal(withPress.display_name, "Riverbank Quarter")
  assert.deepEqual(withPress.evidence.stories, [{ url: "https://publisher.example/story" }])
  assert.deepEqual(withPress.evidence.description_audit, { outcome: "complete" })

  const rerun = buildDeterministicNotableMutation(row, withPress)
  assert.equal(rerun.row.display_name, "Riverbank Quarter")
  assert.deepEqual(rerun.row.evidence, withPress.evidence)
  assert.deepEqual(rerun.row.classification_sources, ["deterministic", "press"])
})

test("reconciliation preserves unrelated manual categories and is idempotent", () => {
  const row = application("Construction of four padel courts and an associated clubhouse")
  const existing = {
    ...buildDeterministicNotableMutation(row, null).row,
    notable_categories: ["manual-feature", "press"],
    classification_sources: ["manual", "press"],
    classification_reasons: { manual: { note: "Editorially reviewed" } },
    display_name: "Community Padel Club",
  }
  const first = buildDeterministicNotableMutation(row, existing)
  assert.ok(first.row.notable_categories.includes("padel"))
  assert.ok(first.row.notable_categories.includes("manual-feature"))
  assert.ok(first.row.notable_categories.includes("press"))
  assert.equal(first.row.display_name, "Community Padel Club")
  assert.deepEqual(first.row.classification_reasons.manual, { note: "Editorially reviewed" })

  const second = buildDeterministicNotableMutation(row, first.row)
  assert.equal(second.changed, false)
  assert.deepEqual(second.row, first.row)
})

test("Cork City 26/44496 Boxd press and authoritative enrichment remain intact", () => {
  const boxd = application(
    "Retention of coffee shop use at Florence Buildings, Washington Street West, Cork",
    { id: "00000000-0000-0000-0000-000000044496", local_authority_code: "CORKCITY", reference: "26/44496", applicant_name: "CC & H Imperial Ltd" }
  )
  const existing = {
    application_id: boxd.id,
    source: "press",
    reason: "Notable Planning application identified from Irish press coverage.",
    evidence: { stories: [{ headline: "Boxd coffee to open new Cork city location" }] },
    active: true,
    priority_eligible: true,
    display_name: "Boxd Coffee",
    search_aliases: ["Boxd", "Boxd Coffee", "Boxd Washington Street"],
    notable_categories: ["press"],
    classification_reasons: { press: { reasons: ["Matched to Irish press coverage"] } },
    classification_sources: ["press"],
  }
  const result = buildDeterministicNotableMutation(boxd, existing)
  assert.equal(result.row.active, true)
  assert.equal(result.row.display_name, "Boxd Coffee")
  assert.deepEqual(result.row.search_aliases, existing.search_aliases)
  assert.deepEqual(result.row.evidence, existing.evidence)
  assert.deepEqual(result.row.classification_sources, ["press"])
  assert.deepEqual(result.row.notable_categories, ["press"])
  assert.equal(boxd.proposal, "Retention of coffee shop use at Florence Buildings, Washington Street West, Cork")
})

function mockSupabase(existingRows) {
  const writes = { notable: [], queue: [] }
  return {
    writes,
    from(table) {
      if (table === "planning_seo_notable") return {
        select() { return { in: async () => ({ data: existingRows, error: null }) } },
        async upsert(rows) { writes.notable.push(...rows); return { error: null } },
      }
      if (table === "planning_revalidation_queue") return {
        async upsert(rows) { writes.queue.push(...rows); return { error: null } },
      }
      throw new Error(`Unexpected table ${table}`)
    },
  }
}

test("persistence enqueues only material notable-state changes", async () => {
  const row = application("Development of 120 homes")
  const existing = buildDeterministicNotableMutation(row, null).row
  const unchangedDb = mockSupabase([existing])
  const unchanged = await classifyAndPersistPlanningApplications(unchangedDb, [row])
  assert.equal(unchanged.changed, 0)
  assert.deepEqual(unchangedDb.writes.notable, [])
  assert.deepEqual(unchangedDb.writes.queue, [])

  const changedDb = mockSupabase([existing])
  const changed = await classifyAndPersistPlanningApplications(changedDb, [
    { ...row, proposal: "Internal alterations only" },
  ], { now: () => "2026-08-28T10:00:00.000Z" })
  assert.equal(changed.changed, 1)
  assert.equal(changedDb.writes.notable.length, 1)
  assert.equal(changedDb.writes.notable[0].active, false)
  assert.deepEqual(changedDb.writes.queue, [{
    application_id: row.id,
    requested_at: "2026-08-28T10:00:00.000Z",
  }])
})

test("dry-run classification performs no database writes or queue fan-out", async () => {
  const row = application("Construction of four padel courts")
  const database = mockSupabase([])
  const result = await classifyAndPersistPlanningApplications(database, [row], {
    dryRun: true,
    enqueue: false,
  })
  assert.equal(result.scanned, 1)
  assert.equal(result.created, 1)
  assert.equal(result.changed, 1)
  assert.deepEqual(database.writes.notable, [])
  assert.deepEqual(database.writes.queue, [])
})

test("structural expiry is idempotent and queues only the material priority change", async () => {
  const active = application("Development of a 6 turbine wind farm", {
    normalized_status: "under_assessment",
  })
  const existing = buildDeterministicNotableMutation(active, null, undefined, {
    asOf: eligibilityAsOf,
  }).row
  const expired = {
    ...active,
    normalized_status: "final_grant",
    decision_date: "2025-07-28",
  }

  const changedDb = mockSupabase([existing])
  const changed = await classifyAndPersistPlanningApplications(changedDb, [expired], {
    now: () => "2026-08-28T10:00:00.000Z",
  })
  assert.equal(changed.changed, 1)
  assert.equal(changedDb.writes.notable[0].priority_eligible, false)
  assert.ok(changedDb.writes.notable[0].classification_reasons.deterministic)
  assert.deepEqual(changedDb.writes.queue.map((row) => row.application_id), [active.id])

  const unchangedDb = mockSupabase([changedDb.writes.notable[0]])
  const unchanged = await classifyAndPersistPlanningApplications(unchangedDb, [expired], {
    now: () => "2026-08-28T10:00:00.000Z",
  })
  assert.equal(unchanged.changed, 0)
  assert.deepEqual(unchangedDb.writes.queue, [])
})
