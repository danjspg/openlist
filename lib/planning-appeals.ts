import { cache } from "react"
import { getServerSupabase } from "@/lib/supabase"

export type PlanningAppealCase = {
  id: string
  acp_case_number: string
  received_date: string | null
  decision: string | null
  decision_date: string | null
  source_url: string | null
  planning_authority: string | null
  category: string | null
  case_type: string | null
  development_description: string | null
  development_address: string | null
  source_updated_at: string | null
  planning_authority_case_reference: string | null
  match_method: string
  confidence: "high" | "medium" | "low"
}

type AppealLinkRow = {
  match_method: string
  confidence: "high" | "medium" | "low"
  planning_appeal_cases: Omit<PlanningAppealCase, "match_method" | "confidence"> | Array<Omit<PlanningAppealCase, "match_method" | "confidence">> | null
}

export const getPlanningAppealsForApplication = cache(async function getPlanningAppealsForApplication(
  applicationId: string
): Promise<PlanningAppealCase[]> {
  const { data, error } = await getServerSupabase()
    .from("planning_appeal_links")
    .select(`
      match_method,
      confidence,
      planning_appeal_cases(
        id,acp_case_number,received_date,decision,decision_date,source_url,
        planning_authority,category,case_type,development_description,development_address,
        source_updated_at,planning_authority_case_reference
      )
    `)
    .eq("planning_application_id", applicationId)
    .eq("confidence", "high")

  if (error) {
    console.warn("Planning appeal query failed.", error.message)
    return []
  }

  const appeals = (data ?? []).flatMap((row) => {
    const typed = row as unknown as AppealLinkRow
    const cases = Array.isArray(typed.planning_appeal_cases)
      ? typed.planning_appeal_cases
      : typed.planning_appeal_cases
        ? [typed.planning_appeal_cases]
        : []
    return cases.map((appeal) => ({
      ...appeal,
      match_method: typed.match_method,
      confidence: typed.confidence,
    }))
  })

  return appeals.sort((left, right) =>
    (right.received_date || "").localeCompare(left.received_date || "") ||
    right.acp_case_number.localeCompare(left.acp_case_number)
  )
})
