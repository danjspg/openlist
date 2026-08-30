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

export async function runBcmsAcquisition({ supabase, fetchImpl = fetch, mode = "append", limit = 500, cursor: suppliedCursor } = {}) {
  if (!supabase) throw new Error("supabase is required")
  const stage = mode === "audit" ? "acquisition_audit" : "acquisition_append"
  const { data: checkpoint, error: checkpointError } = await supabase.from("bcms_pipeline_checkpoints").select("cursor_text").eq("stage", stage).maybeSingle()
  if (checkpointError) throw checkpointError
  const cursor = suppliedCursor ?? checkpoint?.cursor_text ?? "0"
  const { data: run, error: runError } = await supabase.from("bcms_pipeline_runs").insert({ stage, mode, start_cursor: cursor }).select("id").single()
  if (runError) throw runError

  const source = {
    async fetchPage({ mode: fetchMode, cursor: pageCursor, limit: pageLimit }) {
      const metadataResponse = await fetchImpl(METADATA_URL, { signal: AbortSignal.timeout(15_000), headers: { "user-agent": "OpenList-BCMS-acquisition/2.0" } })
      if (!metadataResponse.ok) throw new Error(`BCMS metadata request failed: ${metadataResponse.status}`)
      const metadata = await metadataResponse.json()
      const resource = metadata.result?.resources?.find((item) => item.id === BCMS_RESOURCE_ID)
      const url = new URL(fetchMode === "audit" ? DATASTORE_URL : DATASTORE_SQL_URL)
      if (fetchMode === "audit") {
        url.searchParams.set("resource_id", BCMS_RESOURCE_ID)
        url.searchParams.set("limit", String(pageLimit))
        url.searchParams.set("offset", String(Math.max(0, Number(pageCursor) || 0)))
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
        sourceFreshnessAt: resource?.last_modified || metadata.result?.metadata_modified || null,
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
    const report = await acquireBcmsPage({ source, rawStore, mode, cursor, limit })
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
    cursor: valueFor(argv, "--cursor", "") || undefined,
  })
  console.log(JSON.stringify(report, null, 2))
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await runCli()
