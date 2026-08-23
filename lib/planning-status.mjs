const STATUS_GROUPS = {
  pre_validation: [
    "pre validation",
    "pre reg",
    "unregistered application",
    "validation",
  ],
  registered: [
    "new application",
    "new application set up",
    "registered application",
    "application registered",
    "registration",
    "valid",
  ],
  under_assessment: [
    "officer allocation",
    "referral",
    "assessment period",
    "35 day assessment",
    "45 day assessment",
    "49 day assessment",
    "planner assignment",
    "planners report",
    "recommendation review",
    "recommended decision",
    "recommended decision entered",
    "managers order",
    "publication required",
    "provisional recommendation",
    "application under review",
  ],
  further_information_requested: [
    "further information",
    "additional information",
    "additional information requested",
    "ai requested",
    "decision request a.i.",
    "request ai approval",
    "ai request approved",
    "significant ai requested",
    "clarification of ai requested",
    "cai requested",
    "additional information approval required",
    "additional information consultees",
    "ai referral",
    "cai consultees",
    "sai referral",
    "sai consultees",
  ],
  further_information_received: [
    "further information received",
    "additional information received",
    "ai received",
    "cai received",
    "ai not significant",
  ],
  decision_made: [
    "decision",
    "decision made",
    "decision notice issued",
    "decision issued",
    "decision following a.i.",
    "decision review",
  ],
  final_grant: ["final grant", "final grant review"],
  appealed: [
    "appealed",
    "appeal lodged",
    "application appealed",
    "application under appeal",
    "appealed financial",
    "decision appealed",
    "leave to appeal",
    "planner rpt to abp",
    "planners report to acp",
    "appeal report sent to abp",
    "appeal comments due",
    "file to acp",
  ],
  appeal_decided: ["appeal decided"],
  withdrawn: [
    "withdrawn",
    "application withdrawn",
    "planning application withdrawn",
    "deemed withdrawn",
    "withdrawal of application on appeal",
  ],
  invalid: [
    "invalid",
    "invalid application",
    "invalid details sent to applicant",
    "invalid site notice",
    "invalid due to site notice",
    "incompleted",
    "incompleted application",
  ],
  finalised: [
    "application closed",
    "application finalised",
    "pac report & file closed",
    "pac meeting & file closed",
    "application archived",
  ],
}

const STATUS_LABELS = {
  pre_validation: "Pre-validation",
  registered: "Application registered",
  under_assessment: "Under assessment",
  further_information_requested: "Further information requested",
  further_information_received: "Further information received",
  decision_made: "Decision made",
  final_grant: "Final grant",
  appealed: "Under appeal",
  appeal_decided: "Appeal decided",
  withdrawn: "Withdrawn",
  invalid: "Invalid or incomplete",
  finalised: "Application finalised",
  unknown: "Status not classified",
}

function planningStatusKey(value) {
  if (value === null || value === undefined) return ""
  return String(value)
    .normalize("NFKC")
    .trim()
    .toLowerCase()
    .replaceAll("_", " ")
    .replaceAll("-", " ")
    .replace(/\s+/g, " ")
}

const STATUS_INDEX = new Map([
  ...Object.entries(STATUS_GROUPS).flatMap(([canonical, values]) =>
    values.map((value) => [value, canonical])
  ),
  ...Object.entries(STATUS_LABELS).map(([canonical, label]) => [
    planningStatusKey(label),
    canonical,
  ]),
])

const TERMINAL_STATUSES = new Set([
  "final_grant",
  "appeal_decided",
  "withdrawn",
  "invalid",
  "finalised",
])

function normalisePlanningStatus(value) {
  const key = planningStatusKey(value)
  if (!key || key === "n/a") return "unknown"
  return STATUS_INDEX.get(key) || "unknown"
}

function planningStatusLabel(value) {
  return STATUS_LABELS[value] || STATUS_LABELS.unknown
}

function isTerminalPlanningStatus(value) {
  return TERMINAL_STATUSES.has(value)
}

function isCanonicalPlanningStatus(value) {
  return Object.hasOwn(STATUS_LABELS, value)
}

export {
  STATUS_GROUPS,
  STATUS_LABELS,
  isCanonicalPlanningStatus,
  isTerminalPlanningStatus,
  normalisePlanningStatus,
  planningStatusKey,
  planningStatusLabel,
}
