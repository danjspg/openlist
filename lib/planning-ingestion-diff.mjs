import { isLikelyTruncatedCorkSearchProposal } from "./cork-planning-source.mjs"
import { planningStatusKey } from "./planning-status.mjs"

const PLANNING_COMPARISON_FIELDS = [
  "local_authority",
  "local_authority_code",
  "source_application_id",
  "reference",
  "web_reference",
  "application_type",
  "proposal",
  "location",
  "applicant_name",
  "agent_name",
  "status",
  "decision_text",
  "registration_date",
  "valid_date",
  "decision_date",
  "decision_due_date",
  "final_grant_date",
  "expiry_date",
  "further_information_requested_date",
  "further_information_received_date",
  "withdrawal_date",
  "appeal_lodged_date",
  "appeal_decision_date",
  "dispatch_date",
  "appeal_notify_date",
  "ward",
  "area_ids",
  "ward_ids",
  "parish_ids",
  "grid_reference",
  "grid_easting",
  "grid_northing",
  "pending_amendment",
  "source_url",
  "source_api_url",
  "eircode",
  "eircode_prefix",
]

const PLANNING_COMPARISON_SELECT = PLANNING_COMPARISON_FIELDS.join(",")

function normaliseComparable(value) {
  if (value === undefined || value === null) return null
  if (Array.isArray(value)) {
    return value.map(normaliseComparable).sort((left, right) =>
      JSON.stringify(left).localeCompare(JSON.stringify(right))
    )
  }
  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, normaliseComparable(entry)])
    )
  }
  return value
}

function planningRecordsDiffer(existing, incoming) {
  return PLANNING_COMPARISON_FIELDS.some(
    (field) => {
      if (field === "status") {
        return planningStatusKey(existing?.[field]) !== planningStatusKey(incoming?.[field])
      }
      if (field === "decision_text") {
        return planningStatusKey(existing?.[field]) !== planningStatusKey(incoming?.[field])
      }
      if (field === "proposal") {
        const oldProposal = String(existing?.[field] || "").trim().replace(/\s+/g, " ")
        const newProposal = String(incoming?.[field] || "").trim().replace(/\s+/g, " ")
        if (
          isLikelyTruncatedCorkSearchProposal(newProposal) &&
          oldProposal.length > newProposal.length &&
          oldProposal.startsWith(newProposal)
        ) {
          return false
        }
      }
      return (
        JSON.stringify(normaliseComparable(existing?.[field])) !==
        JSON.stringify(normaliseComparable(incoming?.[field]))
      )
    }
  )
}

async function filterChangedPlanningRecords(
  supabase,
  records,
  { authorityCode, from, to, pageSize = 1000 }
) {
  const existingByReference = new Map()
  let offset = 0

  while (true) {
    let query = supabase
      .from("planning_applications")
      .select(PLANNING_COMPARISON_SELECT)
      .eq("local_authority_code", authorityCode)
      .order("reference", { ascending: true })
      .range(offset, offset + pageSize - 1)

    if (from) query = query.gte("registration_date", from)
    if (to) query = query.lte("registration_date", to)

    const { data, error } = await query
    if (error) throw error

    for (const row of data || []) {
      existingByReference.set(row.reference, row)
    }

    if (!data || data.length < pageSize) break
    offset += pageSize
  }

  const changedRecords = records.filter((record) => {
    const existing = existingByReference.get(record.reference)
    return !existing || planningRecordsDiffer(existing, record)
  })

  return {
    changedRecords,
    unchangedCount: records.length - changedRecords.length,
  }
}

export {
  PLANNING_COMPARISON_FIELDS,
  filterChangedPlanningRecords,
  normaliseComparable,
  planningRecordsDiffer,
}
