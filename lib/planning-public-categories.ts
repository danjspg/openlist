import { unstable_cache } from "next/cache"
import { PLANNING_DATASET_CACHE_TAG } from "@/lib/dataset-cache"
import { PLANNING_APPLICATION_SELECT, type PlanningApplication } from "@/lib/planning"
import { getPlanningAuthorityByCode } from "@/lib/planning-authorities"
import { getServerSupabase } from "@/lib/supabase"

export type PlanningPublicCategory = {
  slug: string
  label: string
  shortLabel: string
  description: string
}

export const PLANNING_PUBLIC_CATEGORIES: PlanningPublicCategory[] = [
  { slug: "padel", label: "Padel planning applications", shortLabel: "Padel", description: "Padel clubs, courts and related leisure developments in Irish planning applications." },
  { slug: "large-residential", label: "Large residential developments", shortLabel: "Large residential", description: "Significant housing, apartment and residential schemes identified from Irish planning applications." },
  { slug: "wind-farms", label: "Wind farm planning applications", shortLabel: "Wind farms", description: "Wind farms, turbines and related wind-energy planning applications across Ireland." },
  { slug: "solar-energy", label: "Solar energy planning applications", shortLabel: "Solar energy", description: "Solar farms, photovoltaic arrays and related solar-energy planning applications." },
  { slug: "battery-storage", label: "Battery storage planning applications", shortLabel: "Battery storage", description: "Battery energy storage systems and grid-scale battery developments." },
  { slug: "retail", label: "Retail planning applications", shortLabel: "Retail", description: "Significant supermarkets, stores, retail parks and recognisable retail developments." },
  { slug: "hotels-restaurants", label: "Hotels, restaurants and hospitality", shortLabel: "Hotels & restaurants", description: "Hotels, restaurants, drive-throughs and other significant hospitality developments." },
  { slug: "student-accommodation", label: "Student accommodation planning", shortLabel: "Student accommodation", description: "Purpose-built and large student accommodation planning applications." },
  { slug: "data-centres", label: "Data centre planning applications", shortLabel: "Data centres", description: "Data centres, campuses and related infrastructure planning applications." },
  { slug: "infrastructure", label: "Infrastructure planning applications", shortLabel: "Infrastructure", description: "Significant utility, grid, telecommunications and other infrastructure developments." },
  { slug: "transport", label: "Transport planning applications", shortLabel: "Transport", description: "Rail, airport, port and major road infrastructure planning applications." },
  { slug: "industrial-logistics", label: "Industrial and logistics developments", shortLabel: "Industrial & logistics", description: "Factories, logistics hubs, warehouses and significant industrial developments." },
  { slug: "waste-recycling", label: "Waste and recycling developments", shortLabel: "Waste & recycling", description: "Waste treatment, recycling, recovery and disposal facility planning applications." },
  { slug: "quarrying", label: "Quarrying and extraction planning", shortLabel: "Quarrying", description: "Quarry, mining and mineral-extraction planning applications." },
]

export type PlanningPublicCategoryApplication = {
  application: PlanningApplication
  displayName: string | null
  categories: string[]
}

function matchesCategory(slug: string, row: PlanningPublicCategoryApplication) {
  const proposal = (row.application.proposal || "").toLowerCase()
  const categories = new Set(row.categories)
  if (slug === "padel") return /\bpadel\b/.test(proposal)
  if (slug === "large-residential") return categories.has("residential-large")
  if (slug === "student-accommodation") return categories.has("student-accommodation")
  if (slug === "wind-farms") return categories.has("energy") && /\bwind farm\b|\bwind turbine/.test(proposal)
  if (slug === "solar-energy") return categories.has("energy") && /\bsolar farm\b|\bsolar energy\b|\bphotovoltaic\b/.test(proposal)
  if (slug === "battery-storage") return categories.has("energy") && /\bbattery energy storage\b|\bbess\b|\bgrid[- ]scale battery\b/.test(proposal)
  if (slug === "retail") return categories.has("retail")
  if (slug === "hotels-restaurants") return categories.has("hospitality")
  if (slug === "data-centres") return categories.has("data-centre")
  if (slug === "infrastructure") return categories.has("infrastructure")
  if (slug === "transport") return categories.has("transport")
  if (slug === "industrial-logistics") return categories.has("industrial")
  if (slug === "waste-recycling") return categories.has("waste")
  if (slug === "quarrying") return categories.has("quarry")
  return false
}

const loadPriorityNotables = unstable_cache(async (): Promise<PlanningPublicCategoryApplication[]> => {
  const supabase = getServerSupabase()
  const notableRows: Array<{ application_id: string; display_name: string | null; notable_categories: string[] | null }> = []
  for (let offset = 0; offset < 5000; offset += 1000) {
    const { data, error } = await supabase
      .from("planning_seo_notable")
      .select("application_id,display_name,notable_categories")
      .eq("active", true)
      .eq("priority_eligible", true)
      .range(offset, offset + 999)
    if (error) throw new Error(`Planning public categories metadata lookup failed: ${error.message}`)
    const rows = (data ?? []) as typeof notableRows
    notableRows.push(...rows)
    if (rows.length < 1000) break
  }
  if (!notableRows.length) return []

  const notableById = new Map(notableRows.map((row) => [row.application_id, row]))
  const ids = [...notableById.keys()]
  const applications: PlanningApplication[] = []
  for (let offset = 0; offset < ids.length; offset += 200) {
    const { data, error } = await supabase
      .from("planning_applications")
      .select(PLANNING_APPLICATION_SELECT)
      .in("id", ids.slice(offset, offset + 200))
    if (error) throw new Error(`Planning public categories application lookup failed: ${error.message}`)
    applications.push(...((data ?? []) as PlanningApplication[]))
  }

  return applications
    .map((application) => {
      const notable = notableById.get(application.id)!
      return {
        application,
        displayName: notable.display_name,
        categories: Array.isArray(notable.notable_categories) ? notable.notable_categories.map(String) : [],
      }
    })
    .sort((a, b) => String(b.application.registration_date || "").localeCompare(String(a.application.registration_date || "")))
}, ["planning-public-categories", "v1"], { revalidate: 60 * 60 * 6, tags: [PLANNING_DATASET_CACHE_TAG] })

export async function getPlanningPublicCategory(slug: string) {
  const category = PLANNING_PUBLIC_CATEGORIES.find((item) => item.slug === slug)
  if (!category) return null
  const rows = (await loadPriorityNotables()).filter((row) => matchesCategory(slug, row))
  const authorityCounts = new Map<string, number>()
  for (const row of rows) {
    const code = row.application.local_authority_code
    authorityCounts.set(code, (authorityCounts.get(code) || 0) + 1)
  }
  const authorities = [...authorityCounts.entries()]
    .map(([code, count]) => ({ authority: getPlanningAuthorityByCode(code), count }))
    .filter((item) => item.authority)
    .sort((a, b) => b.count - a.count)
  return { category, rows, authorities }
}

export async function getPlanningPublicCategorySummaries(minimumCount = 3) {
  const rows = await loadPriorityNotables()
  return PLANNING_PUBLIC_CATEGORIES.map((category) => ({
    ...category,
    count: rows.filter((row) => matchesCategory(category.slug, row)).length,
  })).filter((category) => category.count >= minimumCount)
}
