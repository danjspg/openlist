export type PprMarketType = "county" | "dublin_district" | "town_suburb"

export type PprMarket = {
  name: string
  slug: string
  marketType: PprMarketType
  county?: string
  areaSlug?: string
  displayName?: string
}

const BASE_PPR_MARKETS = [
  { name: "Dublin", slug: "dublin", marketType: "county" },
  { name: "Cork", slug: "cork", marketType: "county" },
  { name: "Galway", slug: "galway", marketType: "county" },
  { name: "Limerick", slug: "limerick", marketType: "county" },
  { name: "Kildare", slug: "kildare", marketType: "county" },
  { name: "Wexford", slug: "wexford", marketType: "county" },
  { name: "Waterford", slug: "waterford", marketType: "county" },
  { name: "Meath", slug: "meath", marketType: "county" },
  { name: "Donegal", slug: "donegal", marketType: "county" },
  { name: "Wicklow", slug: "wicklow", marketType: "county" },
  { name: "Tipperary", slug: "tipperary", marketType: "county" },
  { name: "Mayo", slug: "mayo", marketType: "county" },
  { name: "Kerry", slug: "kerry", marketType: "county" },
  { name: "Clare", slug: "clare", marketType: "county" },
  { name: "Kilkenny", slug: "kilkenny", marketType: "county" },
  { name: "Cavan", slug: "cavan", marketType: "county" },
  { name: "Louth", slug: "louth", marketType: "county" },
  { name: "Westmeath", slug: "westmeath", marketType: "county" },
  { name: "Sligo", slug: "sligo", marketType: "county" },
  { name: "Roscommon", slug: "roscommon", marketType: "county" },
  { name: "Carlow", slug: "carlow", marketType: "county" },
  { name: "Longford", slug: "longford", marketType: "county" },
  { name: "Offaly", slug: "offaly", marketType: "county" },
  { name: "Laois", slug: "laois", marketType: "county" },
  { name: "Monaghan", slug: "monaghan", marketType: "county" },
  { name: "Leitrim", slug: "leitrim", marketType: "county" },
  { name: "Dublin 1", slug: "dublin-1", marketType: "dublin_district" },
  { name: "Dublin 2", slug: "dublin-2", marketType: "dublin_district" },
  { name: "Dublin 3", slug: "dublin-3", marketType: "dublin_district" },
  { name: "Dublin 4", slug: "dublin-4", marketType: "dublin_district" },
  { name: "Dublin 5", slug: "dublin-5", marketType: "dublin_district" },
  { name: "Dublin 6", slug: "dublin-6", marketType: "dublin_district" },
  { name: "Dublin 6W", slug: "dublin-6w", marketType: "dublin_district" },
  { name: "Dublin 7", slug: "dublin-7", marketType: "dublin_district" },
  { name: "Dublin 8", slug: "dublin-8", marketType: "dublin_district" },
  { name: "Dublin 9", slug: "dublin-9", marketType: "dublin_district" },
  { name: "Dublin 10", slug: "dublin-10", marketType: "dublin_district" },
  { name: "Dublin 11", slug: "dublin-11", marketType: "dublin_district" },
  { name: "Dublin 12", slug: "dublin-12", marketType: "dublin_district" },
  { name: "Dublin 13", slug: "dublin-13", marketType: "dublin_district" },
  { name: "Dublin 14", slug: "dublin-14", marketType: "dublin_district" },
  { name: "Dublin 15", slug: "dublin-15", marketType: "dublin_district" },
  { name: "Dublin 16", slug: "dublin-16", marketType: "dublin_district" },
  { name: "Dublin 18", slug: "dublin-18", marketType: "dublin_district" },
  { name: "Dublin 22", slug: "dublin-22", marketType: "dublin_district" },
  { name: "Dublin 24", slug: "dublin-24", marketType: "dublin_district" },
  { name: "Drogheda", slug: "drogheda", marketType: "town_suburb" },
  { name: "Dundalk", slug: "dundalk", marketType: "town_suburb" },
  { name: "Navan", slug: "navan", marketType: "town_suburb" },
  { name: "Portlaoise", slug: "portlaoise", marketType: "town_suburb" },
  { name: "Lucan", slug: "lucan", marketType: "town_suburb" },
  { name: "Swords", slug: "swords", marketType: "town_suburb" },
  { name: "Naas", slug: "naas", marketType: "town_suburb" },
  { name: "Gorey", slug: "gorey", marketType: "town_suburb" },
  {
    name: "Blackrock",
    slug: "blackrock-dublin",
    marketType: "town_suburb",
    county: "Dublin",
    areaSlug: "blackrock",
    displayName: "Blackrock, Dublin",
  },
  { name: "Athlone", slug: "athlone", marketType: "town_suburb" },
  { name: "Tralee", slug: "tralee", marketType: "town_suburb" },
  { name: "Ennis", slug: "ennis", marketType: "town_suburb" },
  { name: "Mullingar", slug: "mullingar", marketType: "town_suburb" },
  { name: "Letterkenny", slug: "letterkenny", marketType: "town_suburb" },
  { name: "Enniscorthy", slug: "enniscorthy", marketType: "town_suburb" },
  { name: "Mallow", slug: "mallow", marketType: "town_suburb" },
  { name: "Bray", slug: "bray", marketType: "town_suburb" },
  { name: "Dun Laoghaire", slug: "dun-laoghaire", marketType: "town_suburb" },
  { name: "Killarney", slug: "killarney", marketType: "town_suburb" },
  { name: "Newbridge", slug: "newbridge", marketType: "town_suburb" },
  { name: "Midleton", slug: "midleton", marketType: "town_suburb" },
  { name: "Celbridge", slug: "celbridge", marketType: "town_suburb" },
  { name: "Maynooth", slug: "maynooth", marketType: "town_suburb" },
  { name: "Douglas", slug: "douglas", marketType: "town_suburb" },
  { name: "Malahide", slug: "malahide", marketType: "town_suburb" },
  { name: "Carrigaline", slug: "carrigaline", marketType: "town_suburb" },
  { name: "Greystones", slug: "greystones", marketType: "town_suburb" },
  { name: "Nenagh", slug: "nenagh", marketType: "town_suburb" },
  { name: "Castlebar", slug: "castlebar", marketType: "town_suburb" },
  { name: "Clonmel", slug: "clonmel", marketType: "town_suburb" },
  { name: "Ballina", slug: "ballina", marketType: "town_suburb" },
  { name: "Ballinasloe", slug: "ballinasloe", marketType: "town_suburb" },
  { name: "Balbriggan", slug: "balbriggan", marketType: "town_suburb" },
  { name: "Tullamore", slug: "tullamore", marketType: "town_suburb" },
  { name: "Thurles", slug: "thurles", marketType: "town_suburb" },
  { name: "Ashbourne", slug: "ashbourne", marketType: "town_suburb" },
  { name: "Leixlip", slug: "leixlip", marketType: "town_suburb" },
  { name: "Tuam", slug: "tuam", marketType: "town_suburb" },
  { name: "Dungarvan", slug: "dungarvan", marketType: "town_suburb" },
  { name: "Castletroy", slug: "castletroy", marketType: "town_suburb" },
  { name: "Cobh", slug: "cobh", marketType: "town_suburb" },
  { name: "Kilcock", slug: "kilcock", marketType: "town_suburb" },
  { name: "Tramore", slug: "tramore", marketType: "town_suburb" },
  { name: "Athy", slug: "athy", marketType: "town_suburb" },
  { name: "Glanmire", slug: "glanmire", marketType: "town_suburb" },
  { name: "Citywest", slug: "citywest", marketType: "town_suburb" },
  { name: "Dunshaughlin", slug: "dunshaughlin", marketType: "town_suburb" },
  { name: "Bandon", slug: "bandon", marketType: "town_suburb" },
  { name: "Westport", slug: "westport", marketType: "town_suburb" },
  { name: "Castleknock", slug: "castleknock", marketType: "town_suburb" },
  { name: "Delgany", slug: "delgany", marketType: "town_suburb" },
  { name: "New Ross", slug: "new-ross", marketType: "town_suburb" },
  { name: "Clane", slug: "clane", marketType: "town_suburb" },
  { name: "Tallaght", slug: "tallaght", marketType: "town_suburb" },
  { name: "Donabate", slug: "donabate", marketType: "town_suburb" },
  { name: "Bettystown", slug: "bettystown", marketType: "town_suburb" },
  { name: "Kinsale", slug: "kinsale", marketType: "town_suburb" },
  { name: "Ballincollig", slug: "ballincollig", marketType: "town_suburb" },
  { name: "Leopardstown", slug: "leopardstown", marketType: "town_suburb" },
] as const satisfies readonly PprMarket[]

const SUPPLEMENTAL_PPR_MARKET_SLUGS = [
  "clondalkin",
  "rathfarnham",
  "clonsilla",
  "crumlin",
  "clontarf",
  "raheny",
  "drumcondra",
  "glasnevin",
  "terenure",
  "artane",
  "drimnagh",
  "ballyfermot",
  "finglas",
  "santry",
  "walkinstown",
  "dundrum",
  "adamstown",
  "ballsbridge",
  "blanchardstown",
  "templeogue",
  "arklow",
  "ranelagh",
  "oranmore",
  "rathmines",
  "cabra",
  "stillorgan",
  "sandymount",
  "edenderry",
  "youghal",
  "inchicore",
  "donnybrook",
  "churchtown",
  "loughrea",
  "johnstown",
  "trim",
  "skerries",
  "clonee",
  "knocklyon",
  "harolds-cross",
  "shannon",
  "kells",
  "portarlington",
  "sutton",
  "dooradoyle",
  "ratoath",
  "saggart",
  "newcastle-west",
  "rathgar",
  "carrickmacross",
  "shankill",
  "doughiska",
  "portmarnock",
  "whitehall",
  "palmerstown",
  "listowel",
  "athenry",
  "castlerea",
  "beaumont",
  "claremorris",
  "coolock",
  "ardee",
  "virginia",
  "foxrock",
  "phibsborough",
  "roscrea",
  "blessington",
  "carrick-on-shannon",
  "sandyford",
  "clonakilty",
  "killiney",
  "boyle",
  "finglas-west",
  "baldoyle",
  "stepaside",
  "rush",
  "tullow",
  "lusk",
  "sallins",
  "east-wall",
  "abbeyside",
  "salthill",
  "kilkee",
  "ballinteer",
  "cashel",
  "mountmellick",
  "birr",
  "belturbet",
  "cahir",
  "bundoran",
  "charleville",
  "ballyhaunis",
  "monkstown",
  "kilcullen",
  "hollystown",
  "bantry",
  "gort",
  "glenageary",
  "firhouse",
  "ringsend",
  "fermoy",
  "kimmage",
  "dalkey",
  "kenmare",
  "kilrush",
  "rathcoole",
  "ballinrobe",
  "killester",
  "castleblayney",
  "edgeworthstown",
  "mount-merrion",
  "monasterevin",
  "rathangan",
  "newcastle",
  "bishopstown",
  "ballymote",
  "stoneybatter",
  "macroom",
  "moate",
  "mulhuddart",
  "carrick-on-suir",
  "swinford",
  "donaghmede",
  "athboy",
  "ballyjamesduff",
  "goatstown",
  "knocknacarra",
  "fairview",
  "tyrrelstown",
  "ballycullen",
  "marino",
  "clonskeagh",
  "ballybofey",
  "buncrana",
  "kinnegad",
  "killorglin",
  "claregalway",
  "ballybane",
  "ballymahon",
  "ballyshannon",
  "raheen",
  
  "rathnew",
  "finglas-east",
  
  "donnycarney",
  "skibbereen",
  "howth",
  "kanturk",
  "bailieborough",
  "clonard",
  "ballyconnell",
  
  "dunboyne",
  "tubbercurry",
  "mitchelstown",
  
  "collooney",
  "ballymun",
  "cabinteely",
  
  "strokestown",
  "wilton",
  "rialto",
  "springfield",
  "annacotty",
  "castleconnell",
  "corbally",
  "dunmore-east",
  "ennis-rd",
  "ferrybank",
  "galway-city",
  "gracedieu",
  "limerick-city",
  "lismore",
  "roscam",
  "waterford-city",
] as const

const PPR_MARKET_OVERRIDES: Record<string, Partial<PprMarket>> = {
  bandon: {
    county: "Cork",
  },
  ballincollig: {
    county: "Cork",
  },
  bishopstown: {
    county: "Cork",
  },
  carrigaline: {
    county: "Cork",
  },
  cobh: {
    county: "Cork",
  },
  douglas: {
    county: "Cork",
  },
  glanmire: {
    county: "Cork",
  },
  kinsale: {
    county: "Cork",
  },
  mallow: {
    county: "Cork",
  },
  midleton: {
    county: "Cork",
  },
  annacotty: {
    county: "Limerick",
  },
  beaumont: {
    slug: "beaumont-dublin",
    county: "Dublin",
    areaSlug: "beaumont",
    displayName: "Beaumont, Dublin",
  },
  castleconnell: {
    county: "Limerick",
  },
  corbally: {
    county: "Limerick",
  },
  dooradoyle: {
    county: "Limerick",
  },
  "dunmore-east": {
    county: "Waterford",
  },
  "ennis-rd": {
    county: "Limerick",
  },
  ferrybank: {
    county: "Waterford",
  },
  "galway-city": {
    county: "Galway",
    areaSlug: "galway",
  },
  gracedieu: {
    county: "Waterford",
  },
  johnstown: {
    slug: "johnstown-meath",
    county: "Meath",
    areaSlug: "johnstown",
    displayName: "Johnstown, Meath",
  },
  "limerick-city": {
    county: "Limerick",
    areaSlug: "limerick",
  },
  lismore: {
    county: "Waterford",
  },
  monkstown: {
    slug: "monkstown-dublin",
    county: "Dublin",
    areaSlug: "monkstown",
    displayName: "Monkstown, Dublin",
  },
  "newcastle-west": {
    county: "Limerick",
  },
  newcastle: {
    slug: "newcastle-galway",
    county: "Galway",
    areaSlug: "newcastle",
    displayName: "Newcastle, Galway",
  },
  oranmore: {
    county: "Galway",
  },
  raheen: {
    county: "Limerick",
  },
  roscam: {
    county: "Galway",
  },
  springfield: {
    slug: "springfield-dublin",
    county: "Dublin",
    areaSlug: "springfield",
    displayName: "Springfield, Dublin",
  },
  "waterford-city": {
    county: "Waterford",
    areaSlug: "waterford",
  },
  wilton: {
    slug: "wilton-cork",
    county: "Cork",
    areaSlug: "wilton",
  },
}

function formatSupplementalMarketName(slug: string) {
  return slug
    .split("-")
    .filter(Boolean)
    .map((part, index) => {
      const lower = part.toLowerCase()

      if (lower === "rd") return "Rd"
      if (lower === "st") return "St"
      if (["on", "of"].includes(lower) && index > 0) return lower
      if (lower === "the") return index === 0 ? "The" : "the"
      if (/^\d+$/.test(part)) return part

      return part.charAt(0).toUpperCase() + part.slice(1)
    })
    .join(" ")
}

export const PPR_MARKETS: readonly PprMarket[] = [
  ...BASE_PPR_MARKETS.map((market) => ({
    ...market,
    ...PPR_MARKET_OVERRIDES[market.slug],
  })),
  ...SUPPLEMENTAL_PPR_MARKET_SLUGS.map((slug) => {
    const override = PPR_MARKET_OVERRIDES[slug]

    return {
      name: formatSupplementalMarketName(slug),
      slug,
      marketType: "town_suburb" as const,
      ...override,
    }
  }),
]

export const FEATURED_PPR_MARKETS = [
  "dublin",
  "cork",
  "galway",
  "limerick",
  "drogheda",
  "dundalk",
  "swords",
  "bray",
] as const

export function getPprMarket(slug: string) {
  return PPR_MARKETS.find((market) => market.slug === slug)
}

export function pprMarketLabel(market: PprMarket) {
  return market.displayName || market.name
}

export function isCountyPprMarket(market: PprMarket) {
  return market.marketType === "county"
}

export function dublinDistrictPrefix(market: PprMarket) {
  if (market.marketType !== "dublin_district") return ""
  const district = market.name.replace(/^Dublin\s+/i, "").toUpperCase()
  return district === "6W" ? "D6W" : `D${district.padStart(2, "0")}`
}

const COMPARISON_ROUTE_BY_COUNTY: Partial<Record<string, { href: string; label: string }>> = {
  Dublin: { href: "/sold-prices/dublin-compared", label: "Dublin Market" },
  Cork: { href: "/sold-prices/cork-compared", label: "Cork Market" },
  Limerick: { href: "/sold-prices/limerick-compared", label: "Limerick Market" },
  Galway: { href: "/sold-prices/galway-compared", label: "Galway Market" },
  Waterford: { href: "/sold-prices/waterford-compared", label: "Waterford Market" },
}

const COMMUTER_COMPARISON_SLUGS = new Set([
  "drogheda",
  "dundalk",
  "bray",
  "greystones",
  "naas",
  "newbridge",
  "navan",
  "mullingar",
  "portlaoise",
])

export function getRelevantMarketComparisonLinks(market: PprMarket) {
  const links: Array<{ href: string; label: string }> = []
  const seen = new Set<string>()

  function addLink(link?: { href: string; label: string }) {
    if (!link || seen.has(link.href)) return
    seen.add(link.href)
    links.push(link)
  }

  if (market.marketType === "county") {
    addLink(COMPARISON_ROUTE_BY_COUNTY[market.name])
  } else {
    const countyName =
      market.county || (market.marketType === "dublin_district" ? "Dublin" : undefined)
    if (countyName) {
      addLink(COMPARISON_ROUTE_BY_COUNTY[countyName])
    }
  }

  if (COMMUTER_COMPARISON_SLUGS.has(market.slug)) {
    addLink({ href: "/sold-prices/commuter-towns", label: "Dublin Commuter Towns" })
  }

  addLink({ href: "/sold-prices/rising-markets", label: "Rising Markets" })
  addLink({ href: "/sold-prices/affordable-markets", label: "Affordable Markets" })

  return links
}
