import { unstable_cache } from "next/cache"
import { PLANNING_DATASET_CACHE_TAG } from "@/lib/dataset-cache"
import { getOptionalServerSupabase } from "@/lib/supabase"

export type HomepagePlanningSummary = {
  totalCount: number
  latestRegistrationDate: string | null
}

export type HomepageNotablePlanningItem = {
  applicationId: string
  reference: string
  authorityCode: string | null
  location: string | null
  proposal: string | null
  status: string | null
  decisionText: string | null
  registrationDate: string | null
  decisionDate: string | null
  displayName: string | null
  categories: string[]
}

type PlanningAggregatePayload = {
  totalCount?: number | string | null
  latestRegistrationDate?: string | null
}

const PLACEHOLDER_PLANNING_LABELS = new Set(["n/a", "na", "not available", "not recorded", "-"])

function meaningfulHomepagePlanningLabel(value: string | null | undefined) {
  const cleaned = value?.trim() || ""
  if (!cleaned || PLACEHOLDER_PLANNING_LABELS.has(cleaned.toLowerCase())) return null
  return cleaned
}

const getHomepagePlanningSummaryCached = unstable_cache(
  async (): Promise<HomepagePlanningSummary> => {
    const { data, error } = await getOptionalServerSupabase().rpc(
      "openlist_planning_dashboard_snapshot",
      { p_authority_code: "NATIONAL" }
    )

    if (error || !data) {
      throw new Error(
        `Homepage planning summary failed: ${error?.message ?? "empty response"}`
      )
    }

    const summary = data as PlanningAggregatePayload

    return {
      totalCount: Number(summary.totalCount ?? 0),
      latestRegistrationDate: summary.latestRegistrationDate ?? null,
    }
  },
  ["homepage-planning-summary", "v3-dataset-publication"],
  { revalidate: 60 * 60 * 6, tags: [PLANNING_DATASET_CACHE_TAG] }
)

const getHomepageNotablePlanningCached = unstable_cache(async (): Promise<HomepageNotablePlanningItem[]> => {
  const supabase = getOptionalServerSupabase()
  const { data: notable, error: notableError } = await supabase
    .from("planning_seo_notable")
    .select("application_id,display_name,notable_categories")
    .eq("active", true)
    .eq("priority_eligible", true)
    .order("updated_at", { ascending: false })
    .limit(300)

  if (notableError) throw new Error(`Homepage notable lookup failed: ${notableError.message}`)
  if (!notable?.length) return []

  const ids = notable.map((row) => row.application_id)
  const { data: applications, error: applicationsError } = await supabase
    .from("planning_applications")
    .select("id,reference,local_authority_code,location,proposal,status,decision_text,registration_date,decision_date")
    .in("id", ids)

  if (applicationsError) throw new Error(`Homepage notable application lookup failed: ${applicationsError.message}`)
  const byId = new Map((applications ?? []).map((row) => [row.id, row]))

  return notable.flatMap((row) => {
    const application = byId.get(row.application_id)
    if (!application) return []
    const status = meaningfulHomepagePlanningLabel(application.status)
    const decisionText = meaningfulHomepagePlanningLabel(application.decision_text)
    return [{
      applicationId: row.application_id,
      reference: application.reference,
      authorityCode: application.local_authority_code,
      location: application.location,
      proposal: application.proposal,
      status,
      decisionText: decisionText ?? (application.decision_date ? "Decision recorded" : null),
      registrationDate: application.registration_date,
      decisionDate: application.decision_date,
      displayName: row.display_name,
      categories: Array.isArray(row.notable_categories) ? row.notable_categories.map(String) : [],
    }]
  }).sort((left, right) => {
    const leftDate = left.decisionDate || left.registrationDate || ""
    const rightDate = right.decisionDate || right.registrationDate || ""
    return rightDate.localeCompare(leftDate)
  })
}, ["homepage-notable-planning", "v4-normalized-decision-labels"], { revalidate: 60 * 60 * 6, tags: [PLANNING_DATASET_CACHE_TAG] })

export async function getHomepagePlanningSummary() {
  return getHomepagePlanningSummaryCached()
}

export async function getHomepageNotablePlanning() {
  return getHomepageNotablePlanningCached()
}
