const CORK_CITY_AGILE_START_DATE = "2025-11-26"

const CORK_AGILE_AUTHORITIES = new Map([
  [
    "CORKCOCO",
    {
      code: "CORKCOCO",
      name: "Cork County Council",
      slug: "cork",
      tenant: "corkcoco",
      agileStartDate: null,
    },
  ],
  [
    "CORKCITY",
    {
      code: "CORKCITY",
      name: "Cork City Council",
      slug: "cork-city",
      tenant: "corkcity",
      agileStartDate: CORK_CITY_AGILE_START_DATE,
    },
  ],
])

function corkAgileAuthorityConfig(value = "CORKCOCO") {
  const normalized = String(value || "").trim().toLowerCase()
  return [...CORK_AGILE_AUTHORITIES.values()].find(
    (config) =>
      config.code.toLowerCase() === normalized ||
      config.slug === normalized ||
      config.tenant === normalized
  ) || null
}

function corkAgileApplicationConfig(application) {
  const config = corkAgileAuthorityConfig(application?.local_authority_code)
  if (!config) return null
  if (!config.agileStartDate) return config

  const sourceUrl = String(application?.source_url || "")
  if (sourceUrl.includes(`/${config.tenant}/`)) return config

  const registrationDate = String(application?.registration_date || "").slice(0, 10)
  return registrationDate >= config.agileStartDate ? config : null
}

function corkAgileApplicationUrl(config, reference) {
  if (!config || !reference) return null
  const criteria = encodeURIComponent(JSON.stringify({ query: String(reference).trim() }))
  return `https://planning.agileapplications.ie/${config.tenant}/search-applications/results?criteria=${criteria}`
}

export {
  CORK_AGILE_AUTHORITIES,
  CORK_CITY_AGILE_START_DATE,
  corkAgileApplicationConfig,
  corkAgileApplicationUrl,
  corkAgileAuthorityConfig,
}
