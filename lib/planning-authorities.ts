export type PlanningAuthority = {
  name: string
  shortName: string
  code: string
  slug: string
  sourceName: string
}

export const PLANNING_AUTHORITIES = [
  {
    name: "Cork County Council",
    shortName: "Cork County",
    code: "CORKCOCO",
    slug: "cork",
    sourceName: "Cork County Council",
  },
  {
    name: "Cork City Council",
    shortName: "Cork City",
    code: "CORKCITY",
    slug: "cork-city",
    sourceName: "Cork City Council",
  },
  {
    name: "Dublin City Council",
    shortName: "Dublin City",
    code: "DUBLINCITY",
    slug: "dublin-city",
    sourceName: "Dublin City Council",
  },
  {
    name: "Fingal County Council",
    shortName: "Fingal",
    code: "FINGAL",
    slug: "fingal",
    sourceName: "Fingal County Council",
  },
  {
    name: "South Dublin County Council",
    shortName: "South Dublin",
    code: "SOUTHDUBLIN",
    slug: "south-dublin",
    sourceName: "South Dublin County Council",
  },
  {
    name: "Dun Laoghaire-Rathdown County Council",
    shortName: "Dun Laoghaire-Rathdown",
    code: "DLR",
    slug: "dun-laoghaire-rathdown",
    sourceName: "Dun Laoghaire Rathdown County Council",
  },
  {
    name: "Kildare County Council",
    shortName: "Kildare",
    code: "KILDARE",
    slug: "kildare",
    sourceName: "Kildare County Council",
  },
  {
    name: "Galway County Council",
    shortName: "Galway County",
    code: "GALWAYCOCO",
    slug: "galway-county",
    sourceName: "Galway County Council",
  },
  {
    name: "Galway City Council",
    shortName: "Galway City",
    code: "GALWAYCITY",
    slug: "galway-city",
    sourceName: "Galway City Council",
  },
  {
    name: "Meath County Council",
    shortName: "Meath",
    code: "MEATH",
    slug: "meath",
    sourceName: "Meath County Council",
  },
  {
    name: "Wicklow County Council",
    shortName: "Wicklow",
    code: "WICKLOW",
    slug: "wicklow",
    sourceName: "Wicklow County Council",
  },
  {
    name: "Limerick City and County Council",
    shortName: "Limerick",
    code: "LIMERICK",
    slug: "limerick",
    sourceName: "Limerick County Council",
  },
  {
    name: "Waterford City and County Council",
    shortName: "Waterford",
    code: "WATERFORD",
    slug: "waterford",
    sourceName: "Waterford City and County Council",
  },
  {
    name: "Donegal County Council",
    shortName: "Donegal",
    code: "DONEGAL",
    slug: "donegal",
    sourceName: "Donegal County Council",
  },
  {
    name: "Wexford County Council",
    shortName: "Wexford",
    code: "WEXFORD",
    slug: "wexford",
    sourceName: "Wexford County Council",
  },
  {
    name: "Tipperary County Council",
    shortName: "Tipperary",
    code: "TIPPERARY",
    slug: "tipperary",
    sourceName: "Tipperary County Council",
  },
  {
    name: "Kerry County Council",
    shortName: "Kerry",
    code: "KERRY",
    slug: "kerry",
    sourceName: "Kerry County Council",
  },
  {
    name: "Mayo County Council",
    shortName: "Mayo",
    code: "MAYO",
    slug: "mayo",
    sourceName: "Mayo County Council",
  },
  {
    name: "Clare County Council",
    shortName: "Clare",
    code: "CLARE",
    slug: "clare",
    sourceName: "Clare County Council",
  },
  {
    name: "Louth County Council",
    shortName: "Louth",
    code: "LOUTH",
    slug: "louth",
    sourceName: "Louth County Council",
  },
  {
    name: "Laois County Council",
    shortName: "Laois",
    code: "LAOIS",
    slug: "laois",
    sourceName: "Laois County Council",
  },
  {
    name: "Kilkenny County Council",
    shortName: "Kilkenny",
    code: "KILKENNY",
    slug: "kilkenny",
    sourceName: "Kilkenny County Council",
  },
  {
    name: "Offaly County Council",
    shortName: "Offaly",
    code: "OFFALY",
    slug: "offaly",
    sourceName: "Offaly County Council",
  },
  {
    name: "Cavan County Council",
    shortName: "Cavan",
    code: "CAVAN",
    slug: "cavan",
    sourceName: "Cavan County Council",
  },
  {
    name: "Roscommon County Council",
    shortName: "Roscommon",
    code: "ROSCOMMON",
    slug: "roscommon",
    sourceName: "Roscommon County Council",
  },
  {
    name: "Westmeath County Council",
    shortName: "Westmeath",
    code: "WESTMEATH",
    slug: "westmeath",
    sourceName: "Westmeath County Council",
  },
  {
    name: "Monaghan County Council",
    shortName: "Monaghan",
    code: "MONAGHAN",
    slug: "monaghan",
    sourceName: "Monaghan County Council",
  },
  {
    name: "Sligo County Council",
    shortName: "Sligo",
    code: "SLIGO",
    slug: "sligo",
    sourceName: "Sligo County Council",
  },
  {
    name: "Carlow County Council",
    shortName: "Carlow",
    code: "CARLOW",
    slug: "carlow",
    sourceName: "Carlow County Council",
  },
  {
    name: "Longford County Council",
    shortName: "Longford",
    code: "LONGFORD",
    slug: "longford",
    sourceName: "Longford County Council",
  },
  {
    name: "Leitrim County Council",
    shortName: "Leitrim",
    code: "LEITRIM",
    slug: "leitrim",
    sourceName: "Leitrim County Council",
  },
] as const satisfies readonly PlanningAuthority[]

export const DEFAULT_PLANNING_AUTHORITY = PLANNING_AUTHORITIES[0]

export function getPlanningAuthorityBySlug(slug: string | undefined) {
  return PLANNING_AUTHORITIES.find((authority) => authority.slug === slug) ?? null
}

export function getPlanningAuthorityByCode(code: string) {
  return PLANNING_AUTHORITIES.find((authority) => authority.code === code) ?? null
}
