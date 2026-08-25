import { createClient } from "@supabase/supabase-js"

const DATASET_API = "https://data.nbco.gov.ie/api/3/action/package_show?id=04ab003b-3452-4025-a70a-a775fcccdb1b"
const RESOURCE_ID = "0774e781-7af8-46da-b623-872e74cf541e"

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required")
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
})

function asInteger(value) {
  if (value === null || value === undefined || value === "") return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? Math.trunc(parsed) : null
}

async function main() {
  const checkedAt = new Date().toISOString()
  let observation

  try {
    const response = await fetch(DATASET_API, {
      headers: { "user-agent": "OpenList-BCMS-source-probe/1.0" },
    })
    if (!response.ok) throw new Error(`NBCO metadata request failed: ${response.status}`)

    const payload = await response.json()
    if (!payload?.success || !payload?.result) throw new Error("NBCO metadata response was not successful")

    const resource = payload.result.resources?.find((item) => item.id === RESOURCE_ID)
    if (!resource) throw new Error(`BCMS resource ${RESOURCE_ID} not found`)

    const { data: previous, error: previousError } = await supabase
      .from("bcms_source_probes")
      .select("last_modified,source_hash,source_size,record_count")
      .is("error", null)
      .order("checked_at", { ascending: false })
      .limit(1)
      .maybeSingle()
    if (previousError) throw previousError

    const sourceHash = resource.hash || null
    const sourceSize = asInteger(resource.size)
    const recordCount = asInteger(resource.datastore_active ? resource.total_record_count : resource.total_record_count)
    const lastModified = resource.last_modified || null

    const changed = previous
      ? previous.last_modified !== lastModified ||
        previous.source_hash !== sourceHash ||
        Number(previous.source_size ?? -1) !== Number(sourceSize ?? -1) ||
        Number(previous.record_count ?? -1) !== Number(recordCount ?? -1)
      : null

    observation = {
      checked_at: checkedAt,
      source_url: resource.url,
      resource_id: RESOURCE_ID,
      last_modified: lastModified,
      source_hash: sourceHash,
      source_size: sourceSize,
      record_count: recordCount,
      changed_since_previous: changed,
      metadata: {
        dataset_title: payload.result.title,
        resource_name: resource.name,
        format: resource.format,
        created: resource.created,
        metadata_modified: payload.result.metadata_modified,
      },
      error: null,
    }
  } catch (error) {
    observation = {
      checked_at: checkedAt,
      source_url: DATASET_API,
      resource_id: RESOURCE_ID,
      metadata: {},
      changed_since_previous: null,
      error: error instanceof Error ? error.message : String(error),
    }
  }

  const { error: insertError } = await supabase.from("bcms_source_probes").insert(observation)
  if (insertError) throw insertError

  console.log(JSON.stringify(observation, null, 2))
  if (observation.error) process.exitCode = 1
}

await main()
