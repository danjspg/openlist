import { createHash } from "node:crypto"

export const BCMS_RESOURCE_ID = "0774e781-7af8-46da-b623-872e74cf541e"

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical)
  if (!value || typeof value !== "object") return value
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]))
}

export function bcmsContentHash(record) {
  return createHash("sha256").update(JSON.stringify(canonical(record))).digest("hex")
}

export function prepareAcquiredBcmsRows(rows) {
  return rows.map((row) => ({ ...row, _openlist_content_hash: bcmsContentHash(row) }))
}

export async function acquireBcmsPage({ source, rawStore, mode = "append", cursor = "0", limit = 500 }) {
  const boundedLimit = Math.max(1, Math.min(Number(limit) || 500, 1000))
  const page = await source.fetchPage({ mode, cursor, limit: boundedLimit })
  const rows = prepareAcquiredBcmsRows(page.rows || [])
  const endCursor = String(page.endCursor ?? cursor)
  const stored = await rawStore.store({ rows, mode, endCursor, sourceFreshnessAt: page.sourceFreshnessAt ?? null })
  return { requested: boundedLimit, fetched: rows.length, endCursor, ...stored }
}

export async function replayBcmsProcessing({ processor, normaliseBatches = 1, matchBatches = 1, batchSize = 200 }) {
  const report = { normalization: [], matching: [] }
  for (let index = 0; index < Math.max(0, normaliseBatches); index += 1) {
    const result = await processor.normalize(batchSize)
    report.normalization.push(result)
    if (!result || Number(result.processedRows || 0) === 0) break
  }
  for (let index = 0; index < Math.max(0, matchBatches); index += 1) {
    const result = await processor.match(batchSize)
    report.matching.push(result)
    const work = Object.values(result || {}).reduce((sum, value) => sum + (Number(value) || 0), 0)
    if (work === 0) break
  }
  return report
}
