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
  [
    "WEXFORD",
    {
      code: "WEXFORD",
      name: "Wexford County Council",
      slug: "wexford",
      tenant: "wexford",
      agileStartDate: "2026-06-01",
      normalizeReference(reference) {
        const value = String(reference || "").trim().toUpperCase()
        return /^\d+W$/.test(value) ? value.slice(0, -1) : value
      },
      acceptsReference(reference) {
        return /^\d+W?$/i.test(String(reference || "").trim())
      },
      preserveExistingRegistrationDate: true,
      preserveNullDetailFields: true,
      refreshAllChangedDetails: true,
      detailIdFromSourceUrl: true,
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

function corkAgileCanonicalReference(config, reference) {
  if (!config || !reference) return null
  const value = String(reference).trim()
  return config.normalizeReference ? config.normalizeReference(value) : value
}

function corkAgileAcceptsReference(config, reference) {
  if (!config || !reference) return false
  return config.acceptsReference ? config.acceptsReference(reference) : true
}

function corkAgileSourceApplicationId(config, application) {
  if (!config || !application) return null
  if (config.detailIdFromSourceUrl) {
    const detailId = String(application.source_url || "").match(/\/application-details\/(\d+)/)?.[1]
    if (detailId) return Number(detailId)
  }
  const sourceId = Number(application.source_application_id)
  return Number.isInteger(sourceId) ? sourceId : null
}

export {
  CORK_AGILE_AUTHORITIES,
  CORK_CITY_AGILE_START_DATE,
  corkAgileApplicationConfig,
  corkAgileApplicationUrl,
  corkAgileAcceptsReference,
  corkAgileAuthorityConfig,
  corkAgileCanonicalReference,
  corkAgileSourceApplicationId,
}
