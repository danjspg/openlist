export const LEGACY_SHORT_TOWN_REDIRECTS = {
  trim: "/sold-prices/meath/trim",
  drogheda: "/sold-prices/louth/drogheda",
  carrigaline: "/sold-prices/cork/carrigaline",
  cobh: "/sold-prices/cork/cobh",
  tramore: "/sold-prices/waterford/tramore",
} as const

export function getLegacyShortTownRedirect(slug: string) {
  return LEGACY_SHORT_TOWN_REDIRECTS[
    slug as keyof typeof LEGACY_SHORT_TOWN_REDIRECTS
  ]
}
