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

function escapePostgrestLike(value: string) {
  return value.replace(/[\\%_]/g, (character) => `\\${character}`)
}

export function publicNotableCategoryLabel(category: string, proposal = "") {
  const text = proposal.toLowerCase()
  if (category === "residential-large") return "Large residential"
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
  async (authorityCode: string, locality: string): Promise<PlanningLocalityNotableApplication[]> => {
    const supabase = getServerSupabase()
    const { data: applications, error: applicationsError } = await supabase
      .from("planning_applications")
      .select(PLANNING_APPLICATION_SELECT)
      .eq("local_authority_code", authorityCode)
      .ilike("location", `%${escapePostgrestLike(locality)}%`)
      .order("registration_date", { ascending: false, nullsFirst: false })
      .order("reference", { ascending: false })
      .limit(1000)

    if (applicationsError) {
      console.warn("Planning locality notable application lookup failed.", applicationsError.message)
      return []
    }

    const applicationRows = (applications ?? []) as PlanningApplication[]
    if (!applicationRows.length) return []

    const applicationIds = applicationRows.map((application) => application.id)
    const notableRows: Array<{
      application_id: string
      display_name: string | null
      notable_categories: string[] | null
    }> = []

    for (let offset = 0; offset < applicationIds.length; offset += 200) {
      const { data, error } = await supabase
        .from("planning_seo_notable")
        .select("application_id,display_name,notable_categories")
        .eq("active", true)
        .eq("priority_eligible", true)
        .in("application_id", applicationIds.slice(offset, offset + 200))

      if (error) {
        console.warn("Planning locality notable metadata lookup failed.", error.message)
        return []
      }
      notableRows.push(...((data ?? []) as typeof notableRows))
    }

    const notableByApplicationId = new Map(
      notableRows.map((row) => [
        row.application_id,
        {
          displayName: row.display_name,
          categories: Array.isArray(row.notable_categories)
            ? row.notable_categories.map(String).filter(Boolean)
            : [],
        },
      ])
    )

    return applicationRows.flatMap((application) => {
      const notable = notableByApplicationId.get(application.id)
      return notable && notable.categories.length
        ? [{ application, displayName: notable.displayName, categories: notable.categories }]
        : []
    })
  },
  ["planning-locality-notables", "v1"],
  { revalidate: 60 * 60 * 6, tags: [PLANNING_DATASET_CACHE_TAG] }
)

export async function getPlanningLocalityNotableGroups(authorityCode: string, locality: string) {
  const rows = await getPlanningLocalityNotablesCached(authorityCode, locality)
  return groupPlanningLocalityNotables(rows)
}
