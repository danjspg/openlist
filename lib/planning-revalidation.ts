import { getPlanningAuthorityByCode } from "@/lib/planning-authorities"
import { planningApplicationPath } from "@/lib/property-intelligence"
import { getServerSupabase } from "@/lib/supabase"

type PendingApplication = {
  id: string
  local_authority_code: string
  reference: string
  updated_at: string
}

type QueueClient = ReturnType<typeof getServerSupabase>

export type PlanningRevalidationResult = {
  selected: number
  invalidated: number
  remaining: number
  failures: number
}

export async function drainPlanningRevalidationQueue(
  supabase: QueueClient,
  invalidatePath: (path: string) => void,
  batchSize = 100
): Promise<PlanningRevalidationResult> {
  const limit = Math.max(1, Math.min(batchSize, 100))
  const { data, error } = await supabase
    .from("planning_applications")
    .select("id,local_authority_code,reference,updated_at")
    .eq("revalidation_pending", true)
    .order("updated_at", { ascending: true })
    .order("id", { ascending: true })
    .limit(limit)

  if (error) throw new Error(`Planning revalidation queue read failed: ${error.message}`)

  let invalidated = 0
  let failures = 0
  for (const row of (data ?? []) as PendingApplication[]) {
    const authority = getPlanningAuthorityByCode(row.local_authority_code)
    if (!authority || !row.updated_at) {
      failures += 1
      continue
    }

    try {
      invalidatePath(planningApplicationPath(authority, row.reference))
      const { data: cleared, error: clearError } = await supabase
        .from("planning_applications")
        .update({ revalidation_pending: false })
        .eq("id", row.id)
        .eq("updated_at", row.updated_at)
        .eq("revalidation_pending", true)
        .select("id")
      if (clearError) throw clearError
      if (cleared?.length) invalidated += 1
    } catch (error) {
      failures += 1
      console.error(`Planning revalidation failed for ${row.id}.`, error)
    }
  }

  const { count, error: countError } = await supabase
    .from("planning_applications")
    .select("id", { count: "exact", head: true })
    .eq("revalidation_pending", true)
  if (countError) throw new Error(`Planning revalidation queue count failed: ${countError.message}`)

  return { selected: data?.length ?? 0, invalidated, remaining: count ?? 0, failures }
}
