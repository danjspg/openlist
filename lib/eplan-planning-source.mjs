const EPLAN_BASE_URL = "https://www.eplanning.ie"
const IRISH_DATE = /^(\d{2})\/(\d{2})\/(\d{4})$/

// Only paths confirmed against real authority records belong here. Do not
// manufacture portal paths from council names at runtime.
const EPLAN_AUTHORITIES = {
  KERRY: { path: "KerryCC" },
  MEATH: { path: "MeathCC" },
  WATERFORD: { path: "WaterfordCCC" },
  OFFALY: { path: "OffalyCC" },
}

function normaliseReference(value) {
  return String(value || "").trim().replace(/\s+/g, "").toUpperCase()
}

function parseIrishDate(value) {
  const match = String(value || "").trim().match(IRISH_DATE)
  if (!match) return null
  const [, day, month, year] = match
  const iso = `${year}-${month}-${day}`
  const parsed = new Date(`${iso}T00:00:00Z`)
  return Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== iso
    ? null
    : iso
}

function htmlText(value) {
  return String(value || "")
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/\s+/g, " ")
    .trim()
}

// ePlan renders semantic <th>/<td> planning-detail pairs. Parsing that narrow
// structure is more robust than matching dates anywhere in a whole page.
function detailFieldsFromHtml(html) {
  const fields = new Map()
  const row = /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi
  const pair = /<th\b[^>]*>([\s\S]*?)<\/th>\s*<td\b[^>]*>([\s\S]*?)<\/td>/gi
  for (const tableRow of String(html).matchAll(row)) {
    for (const match of tableRow[1].matchAll(pair)) {
      const label = htmlText(match[1]).replace(/:$/, "").toLowerCase()
      if (label && !fields.has(label)) fields.set(label, htmlText(match[2]))
    }
  }
  return fields
}

function valueFor(fields, label) {
  return parseIrishDate(fields.get(label))
}

function buildEplanApplicationUrl(authorityCode, reference) {
  const authority = EPLAN_AUTHORITIES[authorityCode]
  if (!authority || !normaliseReference(reference)) return null
  return `${EPLAN_BASE_URL}/${authority.path}/AppFileRefDetails/${encodeURIComponent(normaliseReference(reference))}/0`
}

function parseEplanApplicationHtml(html, expectedReference) {
  const fields = detailFieldsFromHtml(html)
  const fileNumber = normaliseReference(fields.get("file number"))
  if (!fileNumber || fileNumber !== normaliseReference(expectedReference)) {
    return { ok: false, reason: "reference_mismatch", fileNumber: fileNumber || null }
  }
  return {
    ok: true,
    fileNumber,
    further_information_requested_date: valueFor(fields, "further info requested"),
    further_information_received_date: valueFor(fields, "further info received"),
    decision_due_date: valueFor(fields, "decision due date"),
    decision_date: valueFor(fields, "decision date"),
    withdrawal_date: valueFor(fields, "withdrawn date"),
    appeal_lodged_date: valueFor(fields, "appeal date"),
    expiry_date: valueFor(fields, "expiry date"),
  }
}

async function fetchEplanApplication(authorityCode, reference, {
  fetchImpl = fetch,
  timeoutMs = 15_000,
  retries = 3,
} = {}) {
  const url = buildEplanApplicationUrl(authorityCode, reference)
  if (!url) return { ok: false, reason: "unsupported_authority" }
  let lastError = null
  for (let attempt = 0; attempt < retries; attempt += 1) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const response = await fetchImpl(url, {
        headers: { "User-Agent": "OpenList active Planning lifecycle enrichment (+https://www.openlist.ie)" },
        signal: controller.signal,
      })
      if (response.status === 404) return { ok: false, reason: "not_found", url }
      if (response.ok) return { ...parseEplanApplicationHtml(await response.text(), reference), url }
      lastError = new Error(`HTTP ${response.status}`)
      if (![408, 425, 429, 500, 502, 503, 504].includes(response.status)) break
    } catch (error) {
      lastError = error
    } finally {
      clearTimeout(timer)
    }
    await new Promise((resolve) => setTimeout(resolve, (attempt + 1) * 1000))
  }
  return { ok: false, reason: "fetch_error", error: String(lastError), url }
}

export {
  EPLAN_AUTHORITIES,
  buildEplanApplicationUrl,
  fetchEplanApplication,
  normaliseReference,
  parseEplanApplicationHtml,
  parseIrishDate,
}
