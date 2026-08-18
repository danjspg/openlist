const NATIONAL_ARCGIS_DATE_FIELDS_TIME_ZONE = "Etc/UTC"

const NATIONAL_PLANNING_LIFECYCLE_FIELDS = Object.freeze({
  withdrawal_date: "WithdrawnDate",
  decision_due_date: "DecisionDueDate",
  expiry_date: "ExpiryDate",
  appeal_lodged_date: "AppealSubmittedDate",
  appeal_decision_date: "AppealDecisionDate",
  further_information_requested_date: "FIRequestDate",
  further_information_received_date: "FIRecDate",
})

const AUTHORITY_PROPOSAL_CEILINGS = new Map([
  ["DLR", 80],
  ["FINGAL", 70],
  ["WEXFORD", 80],
])

const AGILE_AUTHORITY_CONFIG = new Map([
  ["DLR", { client: "DLR", tenant: "dunlaoghaire" }],
  ["FINGAL", { client: "FG", tenant: "fingal" }],
  ["WEXFORD", { client: "WEXFORD", tenant: "wexford" }],
])

function cleanNationalPlanningText(value) {
  if (value === null || value === undefined) return null
  const text = String(value).replace(/\s+/g, " ").trim()
  return text || null
}

function parseNationalArcgisDate(value) {
  if (value === null || value === undefined || value === "") return null
  const milliseconds = Number(value)
  if (!Number.isFinite(milliseconds)) return null
  const date = new Date(milliseconds)
  if (Number.isNaN(date.getTime())) return null
  return date.toISOString().slice(0, 10)
}

function isNationalProposalDetailCandidate(authorityCode, value) {
  const ceiling = AUTHORITY_PROPOSAL_CEILINGS.get(authorityCode)
  const proposal = cleanNationalPlanningText(value)
  return Boolean(ceiling && proposal && proposal.length === ceiling)
}

function authoritativeNationalProposal(searchProposal, fullProposal) {
  const search = cleanNationalPlanningText(searchProposal)
  const full = cleanNationalPlanningText(fullProposal)
  if (full && full.length >= (search?.length || 0)) return full
  return search
}

function nationalAgileAuthorityConfig(authorityCode) {
  return AGILE_AUTHORITY_CONFIG.get(authorityCode) || null
}

/**
 * @param {string} authorityCode
 * @param {unknown} reference
 * @param {string | null | undefined} fallbackUrl
 */
function nationalPlanningSourceUrl(authorityCode, reference, fallbackUrl = null) {
  const config = nationalAgileAuthorityConfig(authorityCode)
  const cleanReference = cleanNationalPlanningText(reference)
  const fallback = cleanNationalPlanningText(fallbackUrl)
  if (!config || !cleanReference) return fallback
  if (authorityCode === "WEXFORD" && fallback) return fallback

  const criteria = encodeURIComponent(JSON.stringify({ query: cleanReference }))
  return `https://planning.agileapplications.ie/${config.tenant}/search-applications/results?criteria=${criteria}`
}

export {
  AUTHORITY_PROPOSAL_CEILINGS,
  NATIONAL_ARCGIS_DATE_FIELDS_TIME_ZONE,
  NATIONAL_PLANNING_LIFECYCLE_FIELDS,
  authoritativeNationalProposal,
  cleanNationalPlanningText,
  isNationalProposalDetailCandidate,
  nationalAgileAuthorityConfig,
  nationalPlanningSourceUrl,
  parseNationalArcgisDate,
}
