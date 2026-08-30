import { pathToFileURL } from "node:url"
import { createClient } from "@supabase/supabase-js"
import { replayBcmsProcessing } from "../lib/bcms-pipeline.mjs"

function intArg(argv, name, fallback, max = 100) {
  const raw = argv.find((argument) => argument.startsWith(`${name}=`))?.slice(name.length + 1)
  return Math.max(1, Math.min(Number(raw) || fallback, max))
}

export async function runBcmsInternalProcessing({ supabase, normaliseBatches = 5, matchBatches = 5, batchSize = 200, catchup = false, catchupCursor = "00000000-0000-0000-0000-000000000000" } = {}) {
  if (!supabase) throw new Error("supabase is required")
  const report = { catchup: null, replay: null }
  if (catchup) {
    const { data, error } = await supabase.rpc("openlist_bcms_enqueue_notable_catchup", { p_after: catchupCursor, p_limit: batchSize })
    if (error) throw error
    report.catchup = data
  }
  const processor = {
    async normalize(limit) {
      const { data, error } = await supabase.rpc("openlist_bcms_process_raw_batch", { p_limit: limit })
      if (error) throw error
      return data
    },
    async match(limit) {
      const { data, error } = await supabase.rpc("openlist_bcms_match_batch", { p_limit: limit })
      if (error) throw error
      return data
    },
  }
  report.replay = await replayBcmsProcessing({ processor, normaliseBatches, matchBatches, batchSize })
  return report
}

export async function runCli(argv = process.argv.slice(2), env = process.env) {
  const url = env.NEXT_PUBLIC_SUPABASE_URL
  const key = env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error("Missing Supabase credentials")
  const report = await runBcmsInternalProcessing({
    supabase: createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } }),
    normaliseBatches: intArg(argv, "--normalise-batches", 5),
    matchBatches: intArg(argv, "--match-batches", 5),
    batchSize: intArg(argv, "--batch-size", 200, 500),
    catchup: argv.includes("--notable-catchup"),
    catchupCursor: argv.find((argument) => argument.startsWith("--cursor="))?.slice(9) || "00000000-0000-0000-0000-000000000000",
  })
  console.log(JSON.stringify(report, null, 2))
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await runCli()
