import { pathToFileURL } from "node:url"
import { createClient } from "@supabase/supabase-js"
import { acquireBcmsPage, BCMS_RESOURCE_ID } from "../lib/bcms-pipeline.mjs"

const DATASTORE_URL = "https://data.nbco.gov.ie/api/3/action/datastore_search"
const DATASTORE_SQL_URL = "https://data.nbco.gov.ie/api/3/action/datastore_search_sql"
const METADATA_URL = "https://data.nbco.gov.ie/api/3/action/package_show?id=bcnccc"

function valueFor(argv, name, fallback = "") {
  const value = argv.find((argument) => argument.startsWith(`${name}=`))
  return value ? value.slice(name.length + 1) : fallback
}

function sameTimestamp(left, right) {
  if (!left || !right) return false
  const leftTime = Date.parse(left)
  const rightTime = Date.parse(right)
  return Number.isFinite(leftTime) && Number.isFinite(rightTime) ? leftTime === rightTime : left === right
}

export async function runBcmsAcquisition({ supabase, fetchImpl = fetch, mode = "append", limit = 500, pages = 1, cursor: suppliedCursor } = {}) {
  if (!supabase) throw new Error("supabase is required")
  const stage = mode === "audit" ? "acquisition_audit" : "acquisition_append"
  const { data: checkpoint, error: checkpointError } = await supabase.from("bcms_pipeline_checkpoints").select("cursor_text,source_freshness_at").eq("stage", stage).maybeSingle()
  if (checkpointError) throw checkpointError
  const cursor = suppliedCursor ?? checkpoint?.cursor_text ?? "0"
  const { data: run, error: runError } = await supabase.from("bcms_pipeline_runs").insert({ stage, mode, start_cursor: cursor }).select("id").single()
  if (runError) throw runError

  let metadataPromise
  const source = {
    async fetchPage({ mode: fetchMode, cursor: pageCursor, limit: pageLimit }) {
      metadataPromise ??= fetchImpl(METADATA_URL, { signal: AbortSignal.timeout(15_000), headers: { "user-agent": "OpenList-BCMS-acquisition/2.0" } }).then(async (response) => {
        if (!response.ok) throw new Error(`BCMS metadata request failed: ${response.status}`)
        return response.json()
      })
      const metadata = await metadataPromise
      const resource = metadata.result?.resources?.find((item) => item.id === BCMS_RESOURCE_ID)
      const sourceFreshnessAt = resource?.last_modified || metadata.result?.metadata_modified || null
      if (fetchMode === "audit" && pageCursor === "0" && sameTimestamp(sourceFreshnessAt, checkpoint?.source_freshness_at)) {
        return { rows: [], endCursor: "0", sourceFreshnessAt }
      }
      const url = new URL(fetchMode === "audit" ? DATASTORE_URL : DATASTORE_SQL_URL)
      if (fetchMode === "audit") {
        url.searchParams.set("resource_id", BCMS_RESOURCE_ID)
        url.searchParams.set("limit", String(pageLimit))
        url.searchParams.set("offset", String(Math.max(0, Number(pageCursor) || 0)))
        url.searchParams.set("sort", "_id asc")
      } else {
        const highWater = Math.max(0, Number(pageCursor) || 0)
        url.searchParams.set("sql", `SELECT * FROM "${BCMS_RESOURCE_ID}" WHERE "_id" > ${highWater} ORDER BY "_id" ASC LIMIT ${pageLimit}`)
      }
      const response = await fetchImpl(url, { signal: AbortSignal.timeout(30_000), headers: { "user-agent": "OpenList-BCMS-acquisition/2.0" } })
      if (!response.ok) throw new Error(`BCMS datastore request failed: ${response.status}`)
      const payload = await response.json()
      if (!payload.success) throw new Error("BCMS datastore returned an unsuccessful response")
      const rows = payload.result?.records || []
      const next = fetchMode === "audit"
        ? Number(pageCursor || 0) + rows.length
        : Math.max(Number(pageCursor || 0), ...rows.map((row) => Number(row._id) || 0))
      const total = Number(payload.result?.total || 0)
      return {
        rows,
        endCursor: fetchMode === "audit" && next >= total ? "0" : String(next),
        sourceFreshnessAt,
      }
    },
  }
  const rawStore = {
    async store({ rows, mode: storeMode, endCursor, sourceFreshnessAt }) {
      const { data, error } = await supabase.rpc("openlist_bcms_store_acquired_rows", { p_resource_id: BCMS_RESOURCE_ID, p_rows: rows, p_run_id: run.id, p_mode: storeMode, p_end_cursor: endCursor, p_source_freshness_at: sourceFreshnessAt })
      if (error) throw error
      return data
    },
  }
  try {
    const reports = []
    let pageCursor = cursor
    const boundedPages = Math.max(1, Math.min(Number(pages) || 1, 25))
    for (let index = 0; index < boundedPages; index += 1) {
      const report = await acquireBcmsPage({ source, rawStore, mode, cursor: pageCursor, limit })
      reports.push(report)
      if (report.fetched === 0 || report.endCursor === pageCursor || (mode === "audit" && report.endCursor === "0")) break
      pageCursor = report.endCursor
    }
    const report = {
      pages: reports.length,
      requested: reports.reduce((sum, item) => sum + Number(item.requested || 0), 0),
      fetched: reports.reduce((sum, item) => sum + Number(item.fetched || 0), 0),
      newOrChangedRows: reports.reduce((sum, item) => sum + Number(item.newOrChangedRows || 0), 0),
      baselinedRows: reports.reduce((sum, item) => sum + Number(item.baselinedRows || 0), 0),
      unchangedRows: reports.reduce((sum, item) => sum + Number(item.unchangedRows || 0), 0),
      endCursor: reports.at(-1)?.endCursor ?? cursor,
    }
    await supabase.from("bcms_pipeline_runs").update({ completed_at: new Date().toISOString(), end_cursor: report.endCursor, counters: report }).eq("id", run.id)
    return report
  } catch (error) {
    await supabase.from("bcms_pipeline_runs").update({ completed_at: new Date().toISOString(), error: error instanceof Error ? error.message : String(error) }).eq("id", run.id)
    throw error
  }
}

export async function runCli(argv = process.argv.slice(2), env = process.env) {
  const url = env.NEXT_PUBLIC_SUPABASE_URL
  const key = env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error("Missing Supabase credentials")
  const report = await runBcmsAcquisition({
    supabase: createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } }),
    mode: argv.includes("--audit") ? "audit" : "append",
    limit: Math.max(1, Math.min(Number(valueFor(argv, "--limit", "500")) || 500, 1000)),
    pages: Math.max(1, Math.min(Number(valueFor(argv, "--pages", "1")) || 1, 25)),
    cursor: valueFor(argv, "--cursor", "") || undefined,
  })
  console.log(JSON.stringify(report, null, 2))
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await runCli()
