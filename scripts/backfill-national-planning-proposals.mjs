import { createClient } from "@supabase/supabase-js"

import {
  AUTHORITY_PROPOSAL_CEILINGS,
  authoritativeNationalProposal,
  nationalPlanningSourceUrl,
} from "../lib/national-planning-source.mjs"
import {
  AUTHORITIES,
  fetchAgileDetailsByReference,
} from "./ingest-national-planning-applications.mjs"

function parseArgs(argv) {
  const options = {
    authorityCode: null,
    from: "2000-01-01",
    to: new Date().toISOString().slice(0, 10),
    afterDate: null,
    afterReference: null,
    limit: 50,
    apply: false,
  }
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === "--authority") options.authorityCode = argv[++index]?.toUpperCase()
    else if (arg === "--from") options.from = argv[++index]
    else if (arg === "--to") options.to = argv[++index]
    else if (arg === "--after-date") options.afterDate = argv[++index]
    else if (arg === "--after-reference") options.afterReference = argv[++index]
    else if (arg === "--limit") options.limit = Number(argv[++index])
    else if (arg === "--apply") options.apply = true
    else throw new Error(`Unknown argument: ${arg}`)
  }
  if (!AUTHORITY_PROPOSAL_CEILINGS.has(options.authorityCode)) {
    throw new Error("--authority must be one of DLR, FINGAL or WEXFORD")
  }
  if (!Number.isInteger(options.limit) || options.limit < 1 || options.limit > 100) {
    throw new Error("--limit must be between 1 and 100")
  }
  if (Boolean(options.afterDate) !== Boolean(options.afterReference)) {
    throw new Error("--after-date and --after-reference must be supplied together")
  }
  return options
}

async function run(options) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY")
  }
  const supabase = createClient(supabaseUrl, serviceRoleKey)
  const authority = AUTHORITIES.find((item) => item.code === options.authorityCode)
  const ceiling = AUTHORITY_PROPOSAL_CEILINGS.get(options.authorityCode)
  let query = supabase
    .from("planning_applications")
    .select("id,reference,proposal,registration_date,source_url")
    .eq("local_authority_code", options.authorityCode)
    .like("proposal", "_".repeat(ceiling))
    .gte("registration_date", options.from)
    .lte("registration_date", options.to)
    .order("registration_date", { ascending: true })
    .order("reference", { ascending: true })
    .limit(options.limit)
  if (options.afterDate && options.afterReference) {
    query = query.or(
      `registration_date.gt.${options.afterDate},and(registration_date.eq.${options.afterDate},reference.gt.${options.afterReference})`
    )
  }
  const { data: rows, error } = await query
  if (error) throw error
  const records = rows || []
  const details = await fetchAgileDetailsByReference(authority, records)
  const repairs = records.flatMap((record) => {
    const detail = details.get(record.reference)
    const proposal = authoritativeNationalProposal(record.proposal, detail?.fullProposal)
    if (!detail || !proposal || proposal === record.proposal) return []
    return [{
      ...record,
      originalProposal: record.proposal,
      proposal,
      source_url: nationalPlanningSourceUrl(
        options.authorityCode,
        record.reference,
        record.source_url
      ),
    }]
  })

  let updated = 0
  if (options.apply) {
    for (const repair of repairs) {
      const { error: updateError } = await supabase
        .from("planning_applications")
        .update({
          proposal: repair.proposal,
          source_url: repair.source_url,
          updated_at: new Date().toISOString(),
        })
        .eq("id", repair.id)
        .eq("proposal", repair.originalProposal)
      if (updateError) throw updateError
      updated += 1
    }
  }

  const last = records.at(-1)
  console.log(JSON.stringify({
    authority: options.authorityCode,
    dryRun: !options.apply,
    scanned: records.length,
    detailRecordsFound: details.size,
    repairable: repairs.length,
    updated,
    nextCursor: last
      ? { afterDate: last.registration_date, afterReference: last.reference }
      : null,
  }, null, 2))
}

const options = parseArgs(process.argv.slice(2))
run(options).catch((error) => {
  console.error(error)
  process.exitCode = 1
})
