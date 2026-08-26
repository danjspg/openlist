const ACP_LAYER_URL = "https://services-eu1.arcgis.com/o56BSnENmD5mYs3j/ArcGIS/rest/services/Cases_2016_Onwards/FeatureServer/3"
const ACP_QUERY_URL = `${ACP_LAYER_URL}/query`

const AUTHORITY_CODES = new Map([
  ["cork county council", "CORKCOCO"], ["cork city council", "CORKCITY"],
  ["dublin city council", "DUBLINCITY"], ["fingal county council", "FINGAL"],
  ["south dublin county council", "SOUTHDUBLIN"],
  ["dun laoghaire rathdown county council", "DLR"], ["dún laoghaire rathdown county council", "DLR"],
  ["kildare county council", "KILDARE"], ["galway county council", "GALWAYCOCO"],
  ["galway city council", "GALWAYCITY"], ["meath county council", "MEATH"],
  ["wicklow county council", "WICKLOW"], ["limerick city and county council", "LIMERICK"],
  ["limerick county council", "LIMERICK"], ["waterford city and county council", "WATERFORD"],
  ["waterford county council", "WATERFORD"], ["donegal county council", "DONEGAL"],
  ["wexford county council", "WEXFORD"], ["tipperary county council", "TIPPERARY"],
  ["kerry county council", "KERRY"], ["mayo county council", "MAYO"],
  ["clare county council", "CLARE"], ["louth county council", "LOUTH"],
  ["laois county council", "LAOIS"], ["kilkenny county council", "KILKENNY"],
  ["offaly county council", "OFFALY"], ["cavan county council", "CAVAN"],
  ["roscommon county council", "ROSCOMMON"], ["westmeath county council", "WESTMEATH"],
  ["monaghan county council", "MONAGHAN"], ["sligo county council", "SLIGO"],
  ["carlow county council", "CARLOW"], ["longford county council", "LONGFORD"],
  ["leitrim county council", "LEITRIM"],
])

function cleanText(value) {
  const text = String(value ?? "").replace(/\s+/g, " ").trim()
  return text || null
}

function normaliseAuthorityName(value) {
  return String(value ?? "")
    .normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[-–—]/g, " ").replace(/\s+/g, " ").trim().toLowerCase()
}

function planningAuthorityCode(value) {
  return AUTHORITY_CODES.get(normaliseAuthorityName(value)) || null
}

function parseArcgisDate(value) {
  if (value === null || value === undefined || value === "") return null
  const date = typeof value === "number" ? new Date(value) : new Date(value)
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10)
}

function parseArcgisTimestamp(value) {
  if (value === null || value === undefined || value === "") return null
  const date = typeof value === "number" ? new Date(value) : new Date(value)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

function decodeHtml(value) {
  return String(value || "")
    .replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">")
}

function pageText(html) {
  return decodeHtml(String(html || ""))
    .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n").replace(/<\/p>|<\/div>|<\/li>|<\/tr>/gi, "\n")
    .replace(/<[^>]+>/g, " ").replace(/[ \t]+/g, " ").replace(/\n\s+/g, "\n").trim()
}

function labelledValue(text, labels) {
  const escaped = labels.map((label) => label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")
  const match = text.match(new RegExp(`(?:${escaped})\\s*:?\\s*(?:\\n\\s*)?([^\\n]{1,180})`, "i"))
  return cleanText(match?.[1])
}

function parseAcpCasePage(html) {
  const text = pageText(html)
  return {
    planningAuthorityCaseReference: labelledValue(text, [
      "Planning Authority Case Reference", "Planning Authority Reference", "PA Case Reference",
    ]),
    caseType: labelledValue(text, ["Case Type", "Type of Case"]),
  }
}

function canonicalCaseUrl(caseNumber, sourceUrl = null) {
  const supplied = cleanText(sourceUrl)
  if (supplied?.startsWith("https://www.pleanala.ie/")) return supplied
  const numeric = String(caseNumber || "").match(/\d{5,}/)?.[0]
  return numeric ? `https://www.pleanala.ie/en-ie/case/${numeric}` : supplied
}

function mapAcpFeature(attributes) {
  const caseNumber = cleanText(attributes.ABPCASEID)
  if (!caseNumber || !Number.isInteger(Number(attributes.OBJECTID))) return null
  const authority = cleanText(attributes.PLANINGATY)
  return {
    source_object_id: Number(attributes.OBJECTID),
    acp_case_number: caseNumber,
    development_description: cleanText(attributes.DEVDESC),
    development_address: cleanText(attributes.DEVADDRESS),
    received_date: parseArcgisDate(attributes.LODGEDON),
    decision: cleanText(attributes.DECISION),
    decision_date: parseArcgisDate(attributes.DECIDED_ON),
    source_url: canonicalCaseUrl(caseNumber, attributes.LINKABPWEB),
    planning_authority: authority,
    planning_authority_code: planningAuthorityCode(authority),
    category: cleanText(attributes.CATEGORY),
    source_updated_at: parseArcgisTimestamp(attributes.UPDATED_ON),
    raw_source: attributes,
    last_seen_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }
}

export {
  ACP_LAYER_URL,
  ACP_QUERY_URL,
  canonicalCaseUrl,
  mapAcpFeature,
  parseAcpCasePage,
  parseArcgisDate,
  planningAuthorityCode,
}
