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
const requestedAuthorities = (process.env.EPLAN_ACTIVE_ENRICH_AUTHORITIES || "")
  .split(",")
  .map((code) => code.trim().toUpperCase())
  .filter(Boolean)
const authorityCodes = requestedAuthorities.length
  ? requestedAuthorities.filter((code) => EPLAN_AUTHORITIES[code])
  : Object.keys(EPLAN_AUTHORITIES)
if (requestedAuthorities.length && !authorityCodes.length) {
  throw new Error("EPLAN_ACTIVE_ENRICH_AUTHORITIES did not include a verified ePlan authority")
}
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function loadCandidates() {
  const selected = `id,reference,local_authority_code,normalized_status,${lifecycleFields.join(",")}`
  const rows = []
  // Avoid a large PostgREST OR predicate against the growing active corpus.
  // Target fields only where their status makes them actionable. In particular,
  // a request-stage application is expected not to have an FI-received date, so
  // it must not be re-fetched every day solely for that future milestone.
  const candidateGroups = [
    { field: "further_information_requested_date", statuses: activeStatuses },
    { field: "further_information_received_date", statuses: ["further_information_received"] },
    { field: "appeal_lodged_date", statuses: ["appealed"] },
  ]
  for (const { field, statuses } of candidateGroups) {
    for (const status of statuses) {
      let query = supabase.from("planning_applications")
        .select(selected)
        .in("local_authority_code", authorityCodes)
        .eq("normalized_status", status)
        .is(field, null)
        .order("id", { ascending: true })
        .limit(limit)
      if (afterId) query = query.gt("id", afterId)
      const { data, error } = await query
      if (error) throw error
      rows.push(...(data || []))
    }
  }
  return Array.from(new Map(rows.map((row) => [row.id, row])).values())
    .sort((a, b) => a.id.localeCompare(b.id))
    .slice(0, limit)
}

const candidates = await loadCandidates()
const report = {
  authorities: authorityCodes,
  selected: candidates.length,
  fetched: 0,
  changed: 0,
  statusLagged: 0,
  notFound: 0,
  conflicts: 0,
  errors: 0,
  fields: {},
}
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
      if (
        (updates.further_information_requested_date && candidate.normalized_status !== "further_information_requested") ||
        (updates.further_information_received_date && candidate.normalized_status !== "further_information_received")
      ) report.statusLagged += 1
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
