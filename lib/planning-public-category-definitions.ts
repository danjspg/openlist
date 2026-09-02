export type PlanningPublicCategory = {
  slug: string
  label: string
  shortLabel: string
  description: string
}

export const PLANNING_PUBLIC_CATEGORIES: PlanningPublicCategory[] = [
  { slug: "padel", label: "Padel planning applications", shortLabel: "Padel", description: "Padel clubs, courts and related leisure developments in Irish planning applications." },
  { slug: "residential-development", label: "Residential development", shortLabel: "Residential development", description: "Housing, apartment and residential schemes of 10 to 49 homes identified from Irish planning applications." },
  { slug: "large-residential", label: "Large residential development", shortLabel: "Large residential development", description: "Housing, apartment and residential schemes of 50 or more homes identified from Irish planning applications." },
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

export type PlanningPublicCategorySourceRow = {
  application_id: string
  proposal: string | null
  local_authority_code: string
  registration_date: string | null
  display_name: string | null
  notable_categories: string[] | null
}

export function planningPublicCategorySummariesFromSource(
  sourceRows: PlanningPublicCategorySourceRow[],
  minimumCount = 3
) {
  return PLANNING_PUBLIC_CATEGORIES
    .map((category) => ({
      ...category,
      count: sourceRows.filter((row) =>
        Array.isArray(row.notable_categories) && row.notable_categories.includes(category.slug)
      ).length,
    }))
    .filter((category) => category.count >= minimumCount)
}

export function planningPublicCategorySummariesFromCounts(
  counts: Array<{ slug: string; count: number }>,
  minimumCount = 3
) {
  const bySlug = new Map(counts.map((item) => [item.slug, Number(item.count) || 0]))
  return PLANNING_PUBLIC_CATEGORIES
    .map((category) => ({ ...category, count: bySlug.get(category.slug) ?? 0 }))
    .filter((category) => category.count >= minimumCount)
}
