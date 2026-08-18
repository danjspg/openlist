import { createClient } from "@supabase/supabase-js"

function parseArgs(argv) {
  const options = { authorityCode: null, limit: 1000, batches: 1, apply: false }
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === "--authority") options.authorityCode = argv[++index]?.toUpperCase()
    else if (arg === "--limit") options.limit = Number(argv[++index])
    else if (arg === "--batches") options.batches = Number(argv[++index])
    else if (arg === "--apply") options.apply = true
    else throw new Error(`Unknown argument: ${arg}`)
  }
  if (!["DLR", "FINGAL"].includes(options.authorityCode)) {
    throw new Error("--authority must be DLR or FINGAL")
  }
  if (!Number.isInteger(options.limit) || options.limit < 1 || options.limit > 5000) {
    throw new Error("--limit must be between 1 and 5000")
  }
  if (!Number.isInteger(options.batches) || options.batches < 1 || options.batches > 10) {
    throw new Error("--batches must be between 1 and 10")
  }
  return options
}

async function run(options) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY")
  }
  if (!options.apply) {
    console.log(JSON.stringify({ ...options, dryRun: true, updated: 0 }, null, 2))
    return
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey)
  let updated = 0
  let batchesRun = 0
  for (let batch = 0; batch < options.batches; batch += 1) {
    const { data, error } = await supabase.rpc("openlist_repair_national_planning_links", {
      p_authority_code: options.authorityCode,
      p_limit: options.limit,
    })
    if (error) throw error
    const batchUpdated = Number(data?.updated || 0)
    updated += batchUpdated
    batchesRun += 1
    if (batchUpdated < options.limit) break
  }
  console.log(JSON.stringify({
    authority: options.authorityCode,
    dryRun: false,
    limit: options.limit,
    batchesRun,
    updated,
  }, null, 2))
}

run(parseArgs(process.argv.slice(2))).catch((error) => {
  console.error(error)
  process.exitCode = 1
})
