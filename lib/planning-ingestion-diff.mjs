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

function isWeakerSourceValue(value) {
  return (
    value === undefined ||
    value === null ||
    (typeof value === "string" && value.trim() === "") ||
    (Array.isArray(value) && value.length === 0)
  )
}

/** @param {Record<string, any>} existing @param {Record<string, any>} incoming @param {{ preserveUnobservedFields?: string[] }} [options] */
function planningRecordsDiffer(existing, incoming, options = {}) {
  return planningRecordsDifferWithOptions(existing, incoming, options)
}

/** @param {Record<string, any>} existing @param {Record<string, any>} incoming @param {{ preserveUnobservedFields?: string[] }} [options] */
function planningRecordChangedFields(existing, incoming, { preserveUnobservedFields = [] } = {}) {
  const preservedFields = new Set(preserveUnobservedFields)
  return PLANNING_COMPARISON_FIELDS.filter((field) => {
    if (preservedFields.has(field) && incoming?.[field] === undefined) return false
    if (field === "status" || field === "decision_text") {
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
  })
}

/** @param {Record<string, any>} existing @param {Record<string, any>} incoming @param {{ preserveUnobservedFields?: string[] }} [options] */
function planningRecordsDifferWithOptions(
  existing,
  incoming,
  { preserveUnobservedFields = [] } = {}
) {
  return planningRecordChangedFields(existing, incoming, { preserveUnobservedFields }).length > 0
}

/** @param {any} supabase @param {Record<string, any>[]} records @param {{ authorityCode: string, from?: string, to?: string, pageSize?: number, preserveExistingFields?: string[], preserveUnobservedFields?: string[], preserveWeakerFields?: string[] }} options */
async function filterChangedPlanningRecords(
  supabase,
  records,
  {
    authorityCode,
    from,
    to,
    pageSize = 1000,
    preserveExistingFields = [],
    preserveUnobservedFields = [],
    preserveWeakerFields = [],
  }
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

  const changeFieldCounts = {}
  const changedSample = []
  const changedRecords = records.map((record) => {
    const existing = existingByReference.get(record.reference)
    if (!existing) return { record, changed: true, fields: ["new_record"] }

    const preserved = { ...record }
    for (const field of preserveExistingFields) {
      if (!isWeakerSourceValue(existing[field])) preserved[field] = existing[field]
    }
    for (const field of preserveUnobservedFields) {
      if (preserved[field] === undefined && existing[field] !== undefined) {
        preserved[field] = existing[field]
      }
    }
    for (const field of preserveWeakerFields) {
      if (isWeakerSourceValue(preserved[field]) && !isWeakerSourceValue(existing[field])) {
        preserved[field] = existing[field]
      }
    }
    const fields = planningRecordChangedFields(existing, preserved, { preserveUnobservedFields })
    return {
      record: preserved,
      changed: fields.length > 0,
      fields,
    }
  }).filter((entry) => entry.changed)

  for (const entry of changedRecords) {
    for (const field of entry.fields) changeFieldCounts[field] = (changeFieldCounts[field] || 0) + 1
    if (changedSample.length < 10) changedSample.push({ reference: entry.record.reference, fields: entry.fields })
  }

  return {
    changedRecords: changedRecords.map((entry) => entry.record),
    unchangedCount: records.length - changedRecords.length,
    changeFieldCounts,
    changedSample,
  }
}

export {
  PLANNING_COMPARISON_FIELDS,
  filterChangedPlanningRecords,
  isWeakerSourceValue,
  normaliseComparable,
  planningRecordChangedFields,
  planningRecordsDiffer,
  planningRecordsDifferWithOptions,
}
