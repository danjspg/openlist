import { PPR_MARKETS, type PprMarket } from "@/lib/ppr-markets"

export const CURATED_PPR_AREA_SITEMAP_SLUGS = [
  "trim",
  "drogheda",
  "carrigaline",
  "cobh",
  "tramore",
] as const

type CanonicalAreaRoute = {
  sourceSlug: string
  countySlug: string
  areaSlug: string
  destination: string
}

function routeSlug(value: string) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/['']/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
}

function canonicalAreaRouteForMarket(market: PprMarket): CanonicalAreaRoute | null {
  if (market.marketType !== "town_suburb" || !market.county) return null

  const sourceSlug = routeSlug(market.slug)
  const countySlug = routeSlug(market.county)
  const areaSlug = routeSlug(market.areaSlug || market.slug)
  if (!sourceSlug || !countySlug || !areaSlug) return null

  return {
    sourceSlug,
    countySlug,
    areaSlug,
    destination: `/sold-prices/${countySlug}/${areaSlug}`,
  }
}

function buildShortTownRouteIndex() {
  const routesBySourceSlug = new Map<string, CanonicalAreaRoute[]>()

  for (const market of PPR_MARKETS) {
    const route = canonicalAreaRouteForMarket(market)
    if (!route) continue

    const routes = routesBySourceSlug.get(route.sourceSlug) || []
    if (!routes.some((existing) => existing.destination === route.destination)) {
      routes.push(route)
    }
    routesBySourceSlug.set(route.sourceSlug, routes)
  }

  const redirects: Record<string, string> = {}
  const ambiguous: Record<string, string[]> = {}

  for (const [slug, routes] of routesBySourceSlug) {
    if (routes.length === 1) {
      redirects[slug] = routes[0].destination
    } else if (routes.length > 1) {
      ambiguous[slug] = routes.map((route) => route.destination)
    }
  }

  return { redirects, ambiguous }
}

const SHORT_TOWN_ROUTE_INDEX = buildShortTownRouteIndex()

export const SHORT_TOWN_REDIRECTS = SHORT_TOWN_ROUTE_INDEX.redirects
export const AMBIGUOUS_SHORT_TOWN_SLUGS = SHORT_TOWN_ROUTE_INDEX.ambiguous

const LEGACY_SHORT_AREA_REDIRECTS: Record<string, string> = {
  abbeyside: "/sold-prices/waterford/abbeyside",
  ardee: "/sold-prices/louth/ardee",
  arklow: "/sold-prices/wicklow/arklow",
  artane: "/sold-prices/dublin/artane",
  athboy: "/sold-prices/meath/athboy",
  ballybane: "/sold-prices/galway/ballybane",
  ballybofey: "/sold-prices/donegal/ballybofey",
  ballyhaunis: "/sold-prices/mayo/ballyhaunis",
  bantry: "/sold-prices/cork/bantry",
  belturbet: "/sold-prices/cavan/belturbet",
  blessington: "/sold-prices/wicklow/blessington",
  boyle: "/sold-prices/roscommon/boyle",
  bundoran: "/sold-prices/donegal/bundoran",
  cahir: "/sold-prices/tipperary/cahir",
  carrickmacross: "/sold-prices/monaghan/carrickmacross",
  "carrick-on-shannon": "/sold-prices/leitrim/carrick-on-shannon",
  "carrick-on-suir": "/sold-prices/tipperary/carrick-on-suir",
  cashel: "/sold-prices/tipperary/cashel",
  castleblayney: "/sold-prices/monaghan/castleblayney",
  charleville: "/sold-prices/cork/charleville",
  claregalway: "/sold-prices/galway/claregalway",
  clondalkin: "/sold-prices/dublin/clondalkin",
  clonee: "/sold-prices/meath/clonee",
  clonsilla: "/sold-prices/dublin/clonsilla",
  clonard: "/sold-prices/meath/clonard",
  clontarf: "/sold-prices/dublin/clontarf",
  crumlin: "/sold-prices/dublin/crumlin",
  dalkey: "/sold-prices/dublin/dalkey",
  drimnagh: "/sold-prices/dublin/drimnagh",
  drumcondra: "/sold-prices/dublin/drumcondra",
  dundrum: "/sold-prices/dublin/dundrum",
  dunboyne: "/sold-prices/meath/dunboyne",
  "east-wall": "/sold-prices/dublin/east-wall",
  edenderry: "/sold-prices/offaly/edenderry",
  fermoy: "/sold-prices/cork/fermoy",
  "finglas-east": "/sold-prices/dublin/finglas-east",
  glasnevin: "/sold-prices/dublin/glasnevin",
  gort: "/sold-prices/galway/gort",
  kenmare: "/sold-prices/kerry/kenmare",
  kells: "/sold-prices/meath/kells",
  kilkee: "/sold-prices/clare/kilkee",
  kilrush: "/sold-prices/clare/kilrush",
  kinnegad: "/sold-prices/westmeath/kinnegad",
  listowel: "/sold-prices/kerry/listowel",
  lusk: "/sold-prices/dublin/lusk",
  mitchelstown: "/sold-prices/cork/mitchelstown",
  monasterevin: "/sold-prices/kildare/monasterevin",
  mountmellick: "/sold-prices/laois/mountmellick",
  portarlington: "/sold-prices/laois/portarlington",
  raheny: "/sold-prices/dublin/raheny",
  rathangan: "/sold-prices/kildare/rathangan",
  rathcoole: "/sold-prices/dublin/rathcoole",
  rathfarnham: "/sold-prices/dublin/rathfarnham",
  roscrea: "/sold-prices/tipperary/roscrea",
  rush: "/sold-prices/dublin/rush",
  saggart: "/sold-prices/dublin/saggart",
  sallins: "/sold-prices/kildare/sallins",
  skerries: "/sold-prices/dublin/skerries",
  stepaside: "/sold-prices/dublin/stepaside",
  swinford: "/sold-prices/mayo/swinford",
  terenure: "/sold-prices/dublin/terenure",
  virginia: "/sold-prices/cavan/virginia",
  walkinstown: "/sold-prices/dublin/walkinstown",
  youghal: "/sold-prices/cork/youghal",
}

export function getShortTownRedirect(slug: string) {
  const key = routeSlug(slug)
  return SHORT_TOWN_REDIRECTS[key] || LEGACY_SHORT_AREA_REDIRECTS[key]
}

export function getCuratedPprAreaSitemapPaths() {
  return Array.from(
    new Set(
      CURATED_PPR_AREA_SITEMAP_SLUGS.map((slug) => getShortTownRedirect(slug)).filter(
        (path): path is string => Boolean(path)
      )
    )
  )
}
