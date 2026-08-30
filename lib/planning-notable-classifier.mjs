export const DEFAULT_PLANNING_NOTABLE_THRESHOLDS = Object.freeze({
  residentialUnits: 10,
  largeResidentialUnits: 50,
  studentAccommodationUnits: 50,
  substantialFloorAreaSqm: 1000,
})

export const DETERMINISTIC_NOTABLE_CATEGORIES = Object.freeze([
  "energy",
  "infrastructure",
  "data-centre",
  "retail",
  "hospitality",
  "commercial",
  "industrial",
  "transport",
  "waste",
  "quarry",
  "residential",
  "residential-large",
  "student-accommodation",
])

const clean = (value) => String(value || "").replace(/\s+/g, " ").trim()
const normalise = (value) => clean(value).toLowerCase().replace(/[–—]/g, "-")

const MINOR_RULES = [
  ["minor.signage", /\b(?:advertis(?:ing|ement)|illuminated|non-illuminated|fascia|shopfront)\s+(?:sign|signage|lettering)|\b(?:sign|signage)\s+(?:only|and no other works)\b/],
  ["minor.shopfront", /\b(?:minor\s+)?(?:shopfront|shop front|facade|façade)\s+(?:alterations?|changes?|works?)\b/],
  ["minor.internal-alterations", /\binternal(?:\s+[a-z]+){0,2}\s+(?:alterations?|fit[- ]?out|works?)\s*(?:only)?\b/],
  ["minor.domestic-extension", /\b(?:single[- ]storey|domestic|rear|side|front)\s+extension\b/],
  ["minor.retention", /\bretention\s+(?:permission\s+)?(?:of|for)\s+(?:minor|existing)?\s*(?:sign|signage|shed|store|structure|alterations?)\b/],
  ["minor.ancillary", /\b(?:small|minor)\s+ancillary\s+(?:building|structure|works?)\b/],
  ["minor.telecoms", /\b(?:replacement|additional|minor|small[- ]scale)\s+(?:telecommunications?\s+)?(?:antennae?|dish(?:es)?|equipment|cabinets?)\b/],
  ["minor.amendment", /\b(?:minor|non-material)\s+(?:amendment|alteration|change)s?\b|\bamendments?\s+to\s+(?:a\s+)?previously\s+approved\b/],
  ["minor.operational-amendment", /\bamend(?:ment|ments|ing)?\b.{0,100}\b(?:opening hours|operating hours|no other amendments)\b/],
  ["minor.ev-equipment", /\binstallation of\s+\d+\s*(?:no\.?\s*)?(?:electric vehicle|ev)\s+chargers?\b/],
  ["minor.building-alterations", /\b(?:elevational|facade|façade)\s+(?:alterations?|amendments?|changes?)\b/],
  ["minor.change-of-use", /\bchange of use\b.*\b(?:no external works|internal works only|small|minor)\b/],
]

const RECOGNISABLE_OPERATORS = /\b(?:aldi|lidl|tesco|supervalu|dunnes(?: stores)?|penneys|primark|mcdonald'?s|burger king|kfc|starbucks|costa coffee|circle k|applegreen)\b/
const SUBSTANTIVE_DEVELOPMENT = /\b(?:construction|construct|erection|erect|development of|provision of|new|redevelopment|demolition and replacement|change of use (?:of .{0,50} )?to)\b/
const SCALE_TERMS = /\b(?:major|large[- ]scale|strategic|substantial|campus|complex|park|centre|center|facility|plant|scheme)\b/

function numberValue(value) {
  const parsed = Number(String(value).replaceAll(",", ""))
  return Number.isFinite(parsed) ? parsed : null
}

function maximumCount(text, unitPattern, contextualPattern = null) {
  const values = []
  const before = new RegExp(`\\b(\\d{1,4}(?:,\\d{3})?)\\s*(?:no\\.?\\s*)?[- ]?(?:${unitPattern})\\b`, "gi")
  const after = new RegExp(`\\b(?:${unitPattern})\\s*(?:units?|bedspaces?|bedrooms?)?\\s*(?:of|for|comprising|totalling|totaling|:)??\\s*(\\d{1,4}(?:,\\d{3})?)\\b`, "gi")
  for (const match of text.matchAll(before)) values.push(numberValue(match[1]))
  for (const match of text.matchAll(after)) values.push(numberValue(match[1]))
  if (contextualPattern) {
    for (const match of text.matchAll(contextualPattern)) values.push(numberValue(match[1]))
  }
  return Math.max(0, ...values.filter((value) => value !== null && value <= 5000))
}

const HISTORICAL_COUNT_CONTEXT = /\b(?:previously approved|previous permission|permission (?:was )?(?:granted )?for|omission of|omit|reduction from|reduce from|change from|amendments? to|modifications? to|reconfiguration of)\b/i

function explicitResidentialTotals(text) {
  const values = []
  const patterns = [
    /\b(?:development|construction|provision|scheme)\s+of\s+(\d{1,4}(?:,\d{3})?)\s*(?:no\.?\s*)?(?:residential|housing)?\s*units?\b(?:\s*(?:,|:|-)?\s*(?:comprising|comprised of|consisting of|including))?/gi,
    /\b(\d{1,4}(?:,\d{3})?)\s*(?:no\.?\s*)?(?:residential|housing)?\s*units?\s*(?:,|:|-)?\s*(?:comprising|comprised of|consisting of|including)\b/gi,
  ]
  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) {
      const context = text.slice(Math.max(0, match.index - 90), match.index + match[0].length)
      if (HISTORICAL_COUNT_CONTEXT.test(context)) continue
      const value = numberValue(match[1])
      if (value !== null && value <= 5000) values.push(value)
    }
  }
  return Math.max(0, ...values)
}

function floorAreaSqm(text) {
  const values = [...text.matchAll(/\b(\d{1,6}(?:,\d{3})?(?:\.\d+)?)\s*(?:sq\.?\s*m(?:etres?)?|sqm|m2|m²)\b/gi)]
    .map((match) => numberValue(match[1]))
    .filter((value) => value !== null && value <= 2_000_000)
  return Math.max(0, ...values)
}

export function extractPlanningScaleSignals(proposal) {
  const text = normalise(proposal)
  const componentResidentialUnits = maximumCount(
    text,
    "(?:houses?|homes?|dwellings?|apartments?|residential units?|housing units?)",
    /\b(?:development|scheme|construction|provision)\s+of\s+(\d{1,4}(?:,\d{3})?)[ -](?:unit\s+)?(?:residential|housing)\b/gi
  )
  // Irish planning descriptions commonly state the scheme total before a
  // component breakdown. Preserve that explicit total instead of mistaking a
  // later apartment/house component for the whole development.
  const explicitResidentialUnits = explicitResidentialTotals(text)
  const residentialUnits = Math.max(explicitResidentialUnits, componentResidentialUnits)
  const studentAccommodationUnits = maximumCount(
    text,
    "(?:student (?:accommodation )?(?:bedspaces?|bedrooms?|beds?|units?)|bedspaces?)",
    /\b(?:student accommodation|purpose[- ]built student accommodation|pbsa)\b.{0,80}?\b(\d{1,4}(?:,\d{3})?)\s*(?:bedspaces?|bedrooms?|beds?|units?)\b/gi
  )
  const prefixedStudentUnits = [...text.matchAll(/\b(\d{1,4}(?:,\d{3})?)[ -](?:bed|bedspace|bedroom|unit)\s+student accommodation\b/gi)]
    .map((match) => numberValue(match[1])).filter((value) => value !== null && value <= 5000)
  return {
    residentialUnits,
    explicitResidentialUnits,
    componentResidentialUnits,
    studentAccommodationUnits: Math.max(studentAccommodationUnits, ...prefixedStudentUnits),
    floorAreaSqm: floorAreaSqm(text),
  }
}

export function classifyPlanningNotability(application, options = {}) {
  const thresholds = { ...DEFAULT_PLANNING_NOTABLE_THRESHOLDS, ...(options.thresholds || {}) }
  const proposal = normalise(application?.proposal)
  const applicant = normalise(application?.applicant_name ?? application?.applicantName)
  const applicationType = normalise(application?.application_type ?? application?.applicationType)
  const text = clean(`${proposal} ${applicationType}`)
  const operatorText = clean(`${proposal} ${applicant}`)
  const scale = extractPlanningScaleSignals(proposal)
  const exclusions = MINOR_RULES.filter(([, pattern]) => pattern.test(text)).map(([id]) => id)
  const matchedRules = []
  const categoryReasons = new Map()
  let strongest = 0

  const add = (category, rule, reason, strength = 1) => {
    matchedRules.push(rule)
    if (!categoryReasons.has(category)) categoryReasons.set(category, reason)
    strongest = Math.max(strongest, strength)
  }
  const match = (pattern, category, rule, reason, strength = 2) => {
    if (pattern.test(text)) add(category, rule, reason, strength)
  }

  match(/\bwind farm\b|\b(?:\d+|six|seven|eight|nine|ten|eleven|twelve)[ -](?:wind )?turbines?\b|\bwind turbine\b/, "energy", "energy.wind", "Wind energy development")
  match(/\bsolar farm\b|\bsolar energy (?:farm|development|facility)\b|\bphotovoltaic (?:farm|energy development|array)\b/, "energy", "energy.solar", "Solar energy development")
  match(/\bbattery energy storage(?: system| facility)?\b|\bbess\b|\bgrid[- ]scale battery\b/, "energy", "energy.bess", "Battery energy storage development")
  match(/\belectricity substation\b|\belectrical substation\b|\besb substation\b|\b(?:grid connection|grid infrastructure|transmission (?:line|infrastructure|station)|high voltage electricity infrastructure)\b/, "infrastructure", "infrastructure.electricity-grid", "Electricity grid or transmission infrastructure")
  match(/\bdata cent(?:re|er)s?\b|\bdata storage campus\b/, "data-centre", "infrastructure.data-centre", "Data centre development")

  if (/\b(?:telecommunications?|telecoms?)\b/.test(text) && /\b(?:mast|tower|monopole|base station|compound)\b/.test(text)) {
    const height = numberValue(text.match(/\b(\d{2,3}(?:\.\d+)?)\s*m(?:etre)?s?\b/)?.[1]) || 0
    add("infrastructure", "infrastructure.telecoms", "Significant telecommunications infrastructure", height >= 15 || SUBSTANTIVE_DEVELOPMENT.test(text) ? 2 : 1)
  }
  match(/\brailway station\b|\brail infrastructure\b|\brailway (?:line|depot|platform|terminal)\b/, "transport", "transport.rail", "Railway station or rail infrastructure")
  match(/\b(?:airport|aerodrome)\b.*\b(?:runway|terminal|hangar|infrastructure|extension|development)\b|\b(?:runway|airport terminal)\b/, "transport", "transport.airport", "Airport infrastructure")
  match(/\b(?:port|harbour|harbor)\b.*\b(?:infrastructure|terminal|quay|pier|berth|development|extension)\b|\b(?:port terminal|harbour infrastructure)\b/, "transport", "transport.port", "Port or harbour infrastructure")
  match(/\b(?:motorway|dual carriageway|national primary road|national secondary road|major road infrastructure|road improvement scheme)\b/, "transport", "transport.major-road", "Motorway or major road infrastructure")
  match(/\b(?:waste treatment|waste transfer|waste recovery|waste processing|landfill|incinerator|incineration|materials recovery facility|recycling centre)\b/, "waste", "waste.facility", "Waste treatment, transfer, recovery or disposal facility")
  match(/\b(?:quarry|quarrying|mining|mine development|mineral extraction|rock extraction|sand and gravel extraction)\b/, "quarry", "industrial.extraction", "Quarry, mining or extraction development")

  const industrialFacility = /\b(?:factory|manufacturing (?:plant|facility|development)|industrial facility|production plant|processing plant)\b/
  if (industrialFacility.test(text)) {
    const strength = SUBSTANTIVE_DEVELOPMENT.test(text) || SCALE_TERMS.test(text) ? 2 : 1
    add("industrial", "industrial.major-facility", "Factory, manufacturing plant or industrial facility", strength)
  }

  const retailUse = "(?:supermarket|discount foodstore|food store|department store|retail park|shopping cent(?:re|er))"
  const retailDevelopment = new RegExp(
    `\\b(?:construction|development|redevelopment|extension|replacement|demolition and replacement|change of use)\\b.{0,100}\\b${retailUse}\\b|\\b${retailUse}\\b.{0,100}\\b(?:construction|development|redevelopment|extension|replacement)\\b`
  )
  const applicantOperator = RECOGNISABLE_OPERATORS.test(applicant)
  const proposalOperatorUse = RECOGNISABLE_OPERATORS.test(proposal)
    && /\b(?:new|construction|development|change of use)\b.{0,80}\b(?:store|foodstore|supermarket|restaurant|cafe|coffee shop|drive[- ]?(?:through|thru))\b/.test(proposal)
  if (retailDevelopment.test(text) || applicantOperator && /\b(?:store|foodstore|supermarket|restaurant|cafe|coffee shop|drive[- ]?(?:through|thru))\b/.test(proposal) || proposalOperatorUse) {
    add("retail", applicantOperator || proposalOperatorUse ? "retail.recognisable-operator" : "retail.anchor", "Significant or recognisable retail development", retailDevelopment.test(text) ? 2 : 1)
  }
  if (/\bhotel\b/.test(text)) {
    add("hospitality", "hospitality.hotel", "Hotel development", SUBSTANTIVE_DEVELOPMENT.test(text) || SCALE_TERMS.test(text) ? 2 : 1)
  }
  if (/\bdrive[- ]?(?:through|thru)\b/.test(text)) add("hospitality", "hospitality.drive-through", "Drive-through commercial development", 2)
  if (/\b(?:petrol filling station|service station|motorway service area)\b/.test(text)) {
    add("commercial", "commercial.service-station", "Petrol filling station or service area", SUBSTANTIVE_DEVELOPMENT.test(text) ? 2 : 1)
  }
  const campusDevelopment = /\b(?:construction|development|redevelopment|extension|provision)\b.{0,80}\b(?:business park|industrial estate)\b|\b(?:business park|industrial estate) development\b/
  const logisticsDevelopment = /\b(?:logistics (?:centre|center|hub|park)|distribution (?:centre|center|hub|depot))\b/
  if (campusDevelopment.test(text) || logisticsDevelopment.test(text)) {
    add(
      /industrial estate|logistics|distribution/.test(text) ? "industrial" : "commercial",
      "commercial.large-campus",
      "Business park, industrial estate, logistics or distribution development",
      2
    )
  }
  const warehouseDevelopment = /\b(?:construction|erection|development|provision)\b.{0,80}\bwarehouses?\b|\bwarehouse (?:development|facility|units?)\b/
  const warehouse = /\bwarehouses?\b/.test(text)
  if (warehouse && (scale.floorAreaSqm >= thresholds.substantialFloorAreaSqm && !/\bdemolition\b.{0,60}\bwarehouses?\b/.test(text) || warehouseDevelopment.test(text))) {
    add("industrial", "industrial.substantial-warehouse", "Substantial warehouse development", 2)
  }
  const restaurant = /\b(?:restaurant|cafe|café|coffee shop|food outlet)\b/.test(text)
  if (restaurant && (RECOGNISABLE_OPERATORS.test(operatorText) || /\b(?:major|large|drive[- ]?(?:through|thru))\b/.test(text) || scale.floorAreaSqm >= 500)) {
    add("hospitality", "hospitality.major-restaurant", "Major or recognisable restaurant development", /drive|major|large/.test(text) ? 2 : 1)
  }
  if (/\b(?:new|construction|development|redevelopment|extension|change of use)\b.{0,80}\b(?:multiplex|cinema)\b|\b(?:multiplex|cinema) (?:development|complex)\b/.test(text)) {
    add("commercial", "commercial.cinema", "Cinema development", 2)
  }
  if (/\b(?:leisure (?:centre|center|complex|development)|sports complex|entertainment complex|large gym|gym and leisure complex)\b/.test(text)) {
    add("commercial", "commercial.major-leisure", "Major leisure development", 2)
  }

  if (scale.residentialUnits >= thresholds.largeResidentialUnits) {
    add("residential-large", "residential.unit-threshold", `${scale.residentialUnits} residential units (threshold ${thresholds.largeResidentialUnits})`, 2)
  } else if (scale.residentialUnits >= thresholds.residentialUnits) {
    add("residential", "residential.unit-threshold", `${scale.residentialUnits} residential units (threshold ${thresholds.residentialUnits})`, 2)
  }
  if (scale.studentAccommodationUnits >= thresholds.studentAccommodationUnits) {
    add("student-accommodation", "residential.student-threshold", `${scale.studentAccommodationUnits} student accommodation units/bedspaces (threshold ${thresholds.studentAccommodationUnits})`, 2)
  }

  const excluded = exclusions.length > 0 && strongest < 2
  const categories = excluded ? [] : [...categoryReasons.keys()]
  const reasons = excluded ? [] : categories.map((category) => categoryReasons.get(category))

  return {
    notable: categories.length > 0,
    categories,
    reasons,
    confidence: categories.length === 0 ? 0 : strongest >= 2 ? 0.94 : 0.78,
    signals: {
      classifierVersion: 2,
      matchedRules,
      exclusions,
      exclusionApplied: excluded,
      residentialUnits: scale.residentialUnits,
      explicitResidentialUnits: scale.explicitResidentialUnits,
      componentResidentialUnits: scale.componentResidentialUnits,
      studentAccommodationUnits: scale.studentAccommodationUnits,
      floorAreaSqm: scale.floorAreaSqm,
      thresholds,
    },
  }
}
