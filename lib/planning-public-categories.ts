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

type PlanningPublicCategoryIndexRow = {
  applicationId: string
  localAuthorityCode: string
  registrationDate: string | null
  displayName: string | null
  categories: string[]
  keywordFlags: number
}

export type PlanningPublicCategorySourceRow = {
  application_id: string
  proposal: string | null
  local_authority_code: string
  registration_date: string | null
  display_name: string | null
  notable_categories: string[] | null
}

export type PlanningPublicCategoryApplication = {
  application: PlanningApplication
  displayName: string | null
  categories: string[]
}

const KEYWORD_PADEL = 1 << 0
const KEYWORD_WIND = 1 << 1
const KEYWORD_SOLAR = 1 << 2
const KEYWORD_BATTERY = 1 << 3
// The current notable corpus is only a few thousand rows. Asking PostgreSQL to
// build and return up to 50,000 rows made category cache misses disproportionately
// expensive during DB pressure. Keep a bounded safety margin without changing
// the public category set or adding another query.
const PUBLIC_CATEGORY_INDEX_LIMIT = 5_000

function keywordFlags(proposal: string | null) {
  const text = (proposal || "").toLowerCase()
  let flags = 0
  if (/\bpadel\b/.test(text)) flags |= KEYWORD_PADEL
  if (/\bwind farm\b|\bwind turbine/.test(text)) flags |= KEYWORD_WIND
  if (/\bsolar farm\b|\bsolar energy\b|\bphotovoltaic\b/.test(text)) flags |= KEYWORD_SOLAR
  if (/\bbattery energy storage\b|\bbess\b|\bgrid[- ]scale battery\b/.test(text)) flags |= KEYWORD_BATTERY
  return flags
}

function matchesCategory(slug: string, row: PlanningPublicCategoryIndexRow) {
  const categories = new Set(row.categories)
  if (slug === "padel") return Boolean(row.keywordFlags & KEYWORD_PADEL)
  if (slug === "residential-development") return categories.has("residential")
  if (slug === "large-residential") return categories.has("residential-large")
  if (slug === "student-accommodation") return categories.has("student-accommodation")
  if (slug === "wind-farms") return categories.has("energy") && Boolean(row.keywordFlags & KEYWORD_WIND)
  if (slug === "solar-energy") return categories.has("energy") && Boolean(row.keywordFlags & KEYWORD_SOLAR)
  if (slug === "battery-storage") return categories.has("energy") && Boolean(row.keywordFlags & KEYWORD_BATTERY)
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

const loadNotableIndex = unstable_cache(async (includeOlder = false): Promise<PlanningPublicCategoryIndexRow[]> => {
  const supabase = getServerSupabase()
  const { data, error } = await supabase.rpc("openlist_planning_public_category_index", {
    p_include_older: includeOlder,
    p_limit: PUBLIC_CATEGORY_INDEX_LIMIT,
  })
  if (error) {
    if (error.code === "PGRST202" || error.message.includes("Could not find the function")) {
      return loadLegacyNotableIndex(includeOlder)
    }
    throw new Error(`Planning public categories index lookup failed: ${error.message}`)
  }

  const rows = (data ?? []) as Array<{
    application_id: string
    proposal: string | null
    local_authority_code: string
    registration_date: string | null
    display_name: string | null
    notable_categories: string[] | null
  }>

  return rows
    .map((row) => ({
      applicationId: row.application_id,
      localAuthorityCode: row.local_authority_code,
      registrationDate: row.registration_date,
      displayName: row.display_name,
      categories: Array.isArray(row.notable_categories) ? row.notable_categories.map(String) : [],
      keywordFlags: keywordFlags(row.proposal),
    }))
    .sort((a, b) => String(b.registrationDate || "").localeCompare(String(a.registrationDate || "")))
}, ["planning-public-categories", "v5-bounded-index"], { revalidate: 60 * 60 * 6, tags: [PLANNING_DATASET_CACHE_TAG] })

async function loadLegacyNotableIndex(includeOlder: boolean): Promise<PlanningPublicCategoryIndexRow[]> {
  const supabase = getServerSupabase()
  let notableQuery = supabase
    .from("planning_seo_notable")
    .select("application_id,display_name,notable_categories")
    .eq("active", true)
    .limit(PUBLIC_CATEGORY_INDEX_LIMIT)
  if (!includeOlder) notableQuery = notableQuery.eq("priority_eligible", true)
  const { data: notableRows, error: notableError } = await notableQuery
  if (notableError) throw new Error(`Planning public categories compatibility lookup failed: ${notableError.message}`)

  const metadata = (notableRows ?? []) as Array<{ application_id: string; display_name: string | null; notable_categories: string[] | null }>
  const notableById = new Map(metadata.map((row) => [row.application_id, row]))
  const applications: Array<{ id: string; proposal: string | null; local_authority_code: string; registration_date: string | null }> = []
  const ids = [...notableById.keys()]
  for (let offset = 0; offset < ids.length; offset += 200) {
    const { data, error } = await supabase
      .from("planning_applications")
      .select("id,proposal,local_authority_code,registration_date")
      .in("id", ids.slice(offset, offset + 200))
    if (error) throw new Error(`Planning public categories compatibility hydration failed: ${error.message}`)
    applications.push(...((data ?? []) as typeof applications))
  }

  return applications.map((application) => {
    const notable = notableById.get(application.id)!
    return {
      applicationId: application.id,
      localAuthorityCode: application.local_authority_code,
      registrationDate: application.registration_date,
      displayName: notable.display_name,
      categories: Array.isArray(notable.notable_categories) ? notable.notable_categories.map(String) : [],
      keywordFlags: keywordFlags(application.proposal),
    }
  }).sort((a, b) => String(b.registrationDate || "").localeCompare(String(a.registrationDate || "")))
}

async function loadApplications(ids: string[]) {
  if (!ids.length) return new Map<string, PlanningApplication>()
  const supabase = getServerSupabase()
  const applications: PlanningApplication[] = []
  for (let offset = 0; offset < ids.length; offset += 200) {
    const { data, error } = await supabase
      .from("planning_applications")
      .select(PLANNING_APPLICATION_SELECT)
      .in("id", ids.slice(offset, offset + 200))
    if (error) throw new Error(`Planning public categories application lookup failed: ${error.message}`)
    applications.push(...((data ?? []) as PlanningApplication[]))
  }
  return new Map(applications.map((application) => [application.id, application]))
}

export async function getPlanningPublicCategorySummary(slug: string) {
  const category = PLANNING_PUBLIC_CATEGORIES.find((item) => item.slug === slug)
  if (!category) return null
  const rows = await loadNotableIndex(false)
  return {
    category,
    totalCount: rows.filter((row) => matchesCategory(slug, row)).length,
  }
}

export async function getPlanningPublicCategory(slug: string, includeOlder = false, authorityCode?: string | null) {
  const category = PLANNING_PUBLIC_CATEGORIES.find((item) => item.slug === slug)
  if (!category) return null
  const categoryRows = (await loadNotableIndex(includeOlder)).filter((row) => matchesCategory(slug, row))
  const authorityCounts = new Map<string, number>()
  for (const row of categoryRows) {
    authorityCounts.set(row.localAuthorityCode, (authorityCounts.get(row.localAuthorityCode) || 0) + 1)
  }
  const authorities = [...authorityCounts.entries()]
    .map(([code, count]) => ({ authority: getPlanningAuthorityByCode(code), count }))
    .filter((item) => item.authority)
    .sort((a, b) => b.count - a.count || String(a.authority?.shortName || "").localeCompare(String(b.authority?.shortName || "")))

  const selectedAuthority = authorityCode ? getPlanningAuthorityByCode(authorityCode) : null
  const rows = selectedAuthority
    ? categoryRows.filter((row) => row.localAuthorityCode === selectedAuthority.code)
    : categoryRows
  const visibleRows = rows.slice(0, 40)
  const applications = await loadApplications(visibleRows.map((row) => row.applicationId))
  const hydratedRows: PlanningPublicCategoryApplication[] = visibleRows.flatMap((row) => {
    const application = applications.get(row.applicationId)
    return application ? [{ application, displayName: row.displayName, categories: row.categories }] : []
  })

  return {
    category,
    rows: hydratedRows,
    totalCount: rows.length,
    overallTotalCount: categoryRows.length,
    authorities,
    includeOlder,
    selectedAuthority,
  }
}

export async function getPlanningPublicCategorySummaries(minimumCount = 3) {
  const rows = await loadNotableIndex(false)
  return PLANNING_PUBLIC_CATEGORIES.map((category) => ({
    ...category,
    count: rows.filter((row) => matchesCategory(category.slug, row)).length,
  })).filter((category) => category.count >= minimumCount)
}

export function planningPublicCategorySummariesFromSource(
  sourceRows: PlanningPublicCategorySourceRow[],
  minimumCount = 3
) {
  const rows: PlanningPublicCategoryIndexRow[] = sourceRows.map((row) => ({
    applicationId: row.application_id,
    localAuthorityCode: row.local_authority_code,
    registrationDate: row.registration_date,
    displayName: row.display_name,
    categories: Array.isArray(row.notable_categories) ? row.notable_categories.map(String) : [],
    keywordFlags: keywordFlags(row.proposal),
  }))

  return PLANNING_PUBLIC_CATEGORIES.map((category) => ({
    ...category,
    count: rows.filter((row) => matchesCategory(category.slug, row)).length,
  })).filter((category) => category.count >= minimumCount)
}
