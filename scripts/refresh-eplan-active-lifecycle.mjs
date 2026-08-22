import { createClient } from "@supabase/supabase-js"
import { EPLAN_AUTHORITIES, fetchEplanApplication } from "../lib/eplan-planning-source.mjs"

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
})
const limit = Math.max(1, Math.min(Number(process.env.EPLAN_ACTIVE_ENRICH_LIMIT || 500), 500))
const delayMs = Math.max(500, Number(process.env.EPLAN_ACTIVE_ENRICH_DELAY_MS || 750))
const afterId = process.env.EPLAN_ACTIVE_ENRICH_AFTER_ID || ""
const dryRun = process.argv.includes("--dry-run")

const activeStatuses = [
  "pre_validation", "registered", "under_assessment", "further_information_requested",
  "further_information_received", "appealed",
]
const lifecycleFields = [
  "further_information_requested_date", "further_information_received_date", "decision_due_date",
  "decision_date", "withdrawal_date", "appeal_lodged_date", "expiry_date",
]
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function loadCandidates() {
  let query = supabase.from("planning_applications")
    .select(`id,reference,local_authority_code,normalized_status,${lifecycleFields.join(",")}`)
    .in("local_authority_code", Object.keys(EPLAN_AUTHORITIES))
    .in("normalized_status", activeStatuses)
    .or("and(normalized_status.eq.further_information_requested,further_information_requested_date.is.null),and(normalized_status.eq.further_information_received,further_information_received_date.is.null),and(normalized_status.eq.appealed,appeal_lodged_date.is.null)")
    .order("id", { ascending: true })
    .limit(limit)
  if (afterId) query = query.gt("id", afterId)
  const { data, error } = await query
  if (error) throw error
  return data || []
}

const candidates = await loadCandidates()
const report = { selected: candidates.length, fetched: 0, changed: 0, notFound: 0, conflicts: 0, errors: 0, fields: {} }
for (const candidate of candidates) {
  const result = await fetchEplanApplication(candidate.local_authority_code, candidate.reference)
  if (!result.ok) {
    report[result.reason === "not_found" ? "notFound" : "errors"] += 1
    console.warn(`${candidate.local_authority_code} ${candidate.reference}: ${result.reason}`)
  } else {
    report.fetched += 1
    const updates = {}
    for (const field of lifecycleFields) {
      const incoming = result[field]
      if (!incoming) continue
      if (candidate[field]) {
        if (candidate[field] !== incoming) report.conflicts += 1
        continue
      }
      updates[field] = incoming
      report.fields[field] = (report.fields[field] || 0) + 1
    }
    if (Object.keys(updates).length) {
      report.changed += 1
      if (!dryRun) {
        const { error } = await supabase.from("planning_applications")
          .update({ ...updates, updated_at: new Date().toISOString(), revalidation_pending: true })
          .eq("id", candidate.id)
          .eq("reference", candidate.reference)
          .eq("local_authority_code", candidate.local_authority_code)
        if (error) throw error
      }
    }
  }
  await sleep(delayMs)
}
console.log(JSON.stringify({ ...report, nextAfterId: candidates.at(-1)?.id || null, dryRun }, null, 2))
