import { unstable_cache } from "next/cache"
import { PLANNING_DATASET_CACHE_TAG } from "@/lib/dataset-cache"
import { PLANNING_APPLICATION_SELECT, type PlanningApplication } from "@/lib/planning"
import { getServerSupabase } from "@/lib/supabase"

export type PlanningLocalityNotableApplication = {
  application: PlanningApplication
  displayName: string | null
  categories: string[]
}

export type PlanningLocalityNotableGroup = {
  key: string
  label: string
  applications: PlanningLocalityNotableApplication[]
}

const CATEGORY_ORDER = [
  "residential",
  "residential-large",
  "student-accommodation",
  "energy",
  "retail",
  "hospitality",
  "infrastructure",
  "transport",
  "data-centre",
  "industrial",
  "commercial",
  "waste",
  "quarry",
]

export function publicNotableCategoryLabel(category: string, proposal = "") {
  const text = proposal.toLowerCase()
  if (category === "residential-large") return "Large residential"
  if (category === "residential") return "Residential development"
  if (category === "student-accommodation") return "Student accommodation"
  if (category === "energy") {
    if (/\bwind farm\b|\bwind turbine/.test(text)) return "Wind farms"
    if (/\bsolar farm\b|\bsolar energy\b|\bphotovoltaic\b/.test(text)) return "Solar energy"
    if (/\bbattery energy storage\b|\bbess\b|\bgrid[- ]scale battery\b/.test(text)) return "Battery storage"
    return "Energy & renewables"
  }
  if (category === "retail") return "Retail"
  if (category === "hospitality") return "Hotels, restaurants & hospitality"
  if (category === "infrastructure") return "Infrastructure"
  if (category === "transport") return "Transport"
  if (category === "data-centre") return "Data centres"
  if (category === "industrial") return "Industrial & logistics"
  if (category === "commercial") return "Commercial"
  if (category === "waste") return "Waste & recycling"
  if (category === "quarry") return "Quarrying & extraction"
  return category.replaceAll("-", " ").replace(/^./, (letter) => letter.toUpperCase())
}

export function groupPlanningLocalityNotables(
  rows: PlanningLocalityNotableApplication[],
  maxGroups = 6,
  maxApplicationsPerGroup = 3
) {
  const groups = new Map<string, PlanningLocalityNotableGroup>()

  for (const row of rows) {
    for (const category of row.categories) {
      const label = publicNotableCategoryLabel(category, row.application.proposal ?? "")
      const key = `${category}:${label}`
      const group = groups.get(key) ?? { key, label, applications: [] }
      if (!group.applications.some((item) => item.application.id === row.application.id)) {
        group.applications.push(row)
      }
      groups.set(key, group)
    }
  }

  const categoryRank = (key: string) => {
    const category = key.split(":", 1)[0]
    const rank = CATEGORY_ORDER.indexOf(category)
    return rank === -1 ? CATEGORY_ORDER.length : rank
  }

  return [...groups.values()]
    .sort(
      (a, b) =>
        b.applications.length - a.applications.length ||
        categoryRank(a.key) - categoryRank(b.key) ||
        a.label.localeCompare(b.label)
    )
    .slice(0, maxGroups)
    .map((group) => ({
      ...group,
      applications: group.applications.slice(0, maxApplicationsPerGroup),
    }))
}

const getPlanningLocalityNotablesCached = unstable_cache(
  async (authorityCode: string, locality: string, includeOlder = false): Promise<PlanningLocalityNotableApplication[]> => {
    const supabase = getServerSupabase()
    const { data: notableRows, error: notableError } = await supabase.rpc(
      "openlist_planning_locality_notables",
      { p_authority_code: authorityCode, p_locality: locality, p_include_older: includeOlder, p_limit: 100 }
    )
    if (notableError) {
      console.warn("Planning locality notable metadata lookup failed.", notableError.message)
      return []
    }
    const metadata = (notableRows ?? []) as Array<{
      application_id: string
      display_name: string | null
      notable_categories: string[] | null
    }>
    if (!metadata.length) return []
    const { data: applications, error: applicationsError } = await supabase
      .from("planning_applications")
      .select(PLANNING_APPLICATION_SELECT)
      .in("id", metadata.map((row) => row.application_id))
    if (applicationsError) return []
    const applicationRows = (applications ?? []) as PlanningApplication[]

    const notableByApplicationId = new Map(
      metadata.map((row) => [
        row.application_id,
        {
          displayName: row.display_name,
          categories: Array.isArray(row.notable_categories)
            ? row.notable_categories.map(String).filter(Boolean)
            : [],
        },
      ])
    )

    return applicationRows
      .flatMap((application) => {
        const notable = notableByApplicationId.get(application.id)
        return notable && notable.categories.length
          ? [{ application, displayName: notable.displayName, categories: notable.categories }]
          : []
      })
      .sort((left, right) =>
        (right.application.registration_date ?? "").localeCompare(left.application.registration_date ?? "") ||
        right.application.reference.localeCompare(left.application.reference)
      )
  },
  ["planning-locality-notables", "v3-history-toggle"],
  { revalidate: 60 * 60 * 6, tags: [PLANNING_DATASET_CACHE_TAG] }
)

export async function getPlanningLocalityNotableGroups(authorityCode: string, locality: string, includeOlder = false) {
  const rows = await getPlanningLocalityNotablesCached(authorityCode, locality, includeOlder)
  return groupPlanningLocalityNotables(rows, includeOlder ? 8 : 6, includeOlder ? 6 : 3)
}
