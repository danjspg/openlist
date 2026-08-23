export const PLANNING_APPLICATION_TYPE_GROUPS = [
  {
    key: "permission",
    label: "Permission",
    values: [
      "PERMISSION",
      "Permission",
      "TEMPORARY PERMISSION",
      "Permission (Maritime)",
      "APPROVAL",
      "REDIII Permisssion",
    ],
  },
  {
    key: "retention",
    label: "Retention",
    values: [
      "RETENTION",
      "Permission for Retention",
      "Retention",
      "Retention Permission",
      "Permission for Retention (SDZ)",
    ],
  },
  {
    key: "permission_retention",
    label: "Permission & retention",
    values: ["Permission and Retention"],
  },
  {
    key: "outline_permission",
    label: "Outline permission",
    values: [
      "OUTLINE PERMISSION",
      "Outline Permisson",
      "Outline Permission",
      "Permission and Outline Permission",
    ],
  },
  {
    key: "permission_consequent",
    label: "Permission consequent",
    values: [
      "PERMISSION CONSEQUENT",
      "Permission Consequent",
      "Perm.consequent on Grant of Outline Perm",
      "Perm on foot of Outline permission",
      "Perm. following Grant of Outline Perm.",
      "Permission & Perm. consq. on Grant of OP",
      "Permission on Foot of Outline Permission",
    ],
  },
  {
    key: "extension_duration",
    label: "Extension of duration",
    values: [
      "EXTENSION OF DURATION",
      "Extension of Duration",
      "Extension Of Duration Of Permission",
      "Further Extension of Duration of Permission",
      "Further Extension of Duration of Perm",
    ],
  },
  {
    key: "exemption",
    label: "Exemption / Section 5",
    values: [
      "Declaration of Exemption Sect. 5",
      "Section 5",
      "Certificate of Exemption - Part V",
      "Sub-article 6",
      "Cert under Part 5 of 2000 Act as amended",
      "Dec Under Section 5",
    ],
  },
  {
    key: "strategic",
    label: "Strategic / large-scale development",
    values: [
      "SDZ Application",
      "Permission (SDZ)",
      "Permission (SHD)",
      "Permission (LRD)",
      "LRD Application",
      "Strategic Housing Development",
      "SHD3-Application to ABP",
      "LRD Permission",
      "SDZ Application Clonburris",
      "LRD3-Application",
      "Strategic Infrastructure Application",
    ],
  },
  {
    key: "public_authority",
    label: "Public authority / Part 8",
    values: [
      "Application Under Part 8",
      "Part Vlll (public consultation)",
      "Section 179A Social Housing Exemption",
      "Application Under Part 10",
      "Section 179 A",
      "Part X (public consultation)",
    ],
  },
  {
    key: "other",
    label: "Other",
    values: [
      "N/A",
      "n/a",
      "Compliance with Conditions",
      "Pre-Application Consultation",
      "Outdoor Event Licence",
      "Local Area Plan Acknowledgement of Submi",
      "Compliance Naming",
      "Quarry Registration",
    ],
  },
] as const

export type PlanningApplicationTypeKey =
  (typeof PLANNING_APPLICATION_TYPE_GROUPS)[number]["key"]

function cleanApplicationType(value: string | null | undefined) {
  return (value ?? "").trim().toLocaleLowerCase("en-IE")
}

export function planningApplicationTypeValues(value: string | null | undefined): string[] {
  const cleaned = cleanApplicationType(value)
  if (!cleaned) return []

  const group = PLANNING_APPLICATION_TYPE_GROUPS.find(
    (candidate) =>
      candidate.key === cleaned ||
      candidate.label.toLocaleLowerCase("en-IE") === cleaned ||
      candidate.values.some(
        (raw) => raw.toLocaleLowerCase("en-IE") === cleaned
      )
  )

  return group ? [...group.values] : [String(value).trim()]
}

export function planningApplicationTypeLabel(value: string | null | undefined) {
  const cleaned = cleanApplicationType(value)
  if (!cleaned) return "Other"

  const group = PLANNING_APPLICATION_TYPE_GROUPS.find(
    (candidate) =>
      candidate.key === cleaned ||
      candidate.label.toLocaleLowerCase("en-IE") === cleaned ||
      candidate.values.some(
        (raw) => raw.toLocaleLowerCase("en-IE") === cleaned
      )
  )

  return group?.label ?? String(value).trim()
}
