const ISO_DATE_PREFIX = /^(\d{4})-(\d{2})-(\d{2})/
const SEARCH_PROPOSAL_LIMIT_MIN = 79
const SEARCH_PROPOSAL_LIMIT_MAX = 81

function parseCorkCouncilDate(value) {
  if (value === null || value === undefined) return null
  const match = String(value).trim().match(ISO_DATE_PREFIX)
  if (!match) return null

  const isoDate = `${match[1]}-${match[2]}-${match[3]}`
  const parsed = new Date(`${isoDate}T00:00:00Z`)
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== isoDate) {
    return null
  }
  return isoDate
}

function isLikelyTruncatedCorkSearchProposal(value) {
  const proposal = String(value || "").trim().replace(/\s+/g, " ")
  return (
    proposal.length >= SEARCH_PROPOSAL_LIMIT_MIN &&
    proposal.length <= SEARCH_PROPOSAL_LIMIT_MAX &&
    !/[.!?)]$/.test(proposal)
  )
}

function authoritativeCorkProposal(searchProposal, fullProposal) {
  const search = String(searchProposal || "").trim().replace(/\s+/g, " ")
  const full = String(fullProposal || "").trim().replace(/\s+/g, " ")
  if (full && full.length >= search.length) return full
  return search || null
}

export {
  authoritativeCorkProposal,
  isLikelyTruncatedCorkSearchProposal,
  parseCorkCouncilDate,
}
