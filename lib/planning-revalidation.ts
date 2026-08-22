import { getPlanningAuthorityByCode } from "@/lib/planning-authorities"
import { planningApplicationPath } from "@/lib/property-intelligence"
import { getServerSupabase } from "@/lib/supabase"

type PendingApplication = {
  id: string
  local_authority_code: string
  reference: string
  updated_at: string
}

type QueuedApplication = {
  application_id: string
  requested_at: string
  planning_applications: Omit<PendingApplication, "updated_at"> | Omit<PendingApplication, "updated_at">[] | null
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
  const { data: queued, error: queueError } = await supabase
    .from("planning_revalidation_queue")
    .select("application_id,requested_at,planning_applications(id,local_authority_code,reference)")
    .order("requested_at", { ascending: true })
    .order("application_id", { ascending: true })
    .limit(limit)

  if (queueError) throw new Error(`Planning exact-path queue read failed: ${queueError.message}`)

  let invalidated = 0
  let failures = 0
  for (const item of (queued ?? []) as QueuedApplication[]) {
    const related = Array.isArray(item.planning_applications)
      ? item.planning_applications[0]
      : item.planning_applications
    const authority = related && getPlanningAuthorityByCode(related.local_authority_code)
    if (!related || !authority) {
      failures += 1
      continue
    }

    try {
      invalidatePath(planningApplicationPath(authority, related.reference))
      const { data: cleared, error: clearError } = await supabase
        .from("planning_revalidation_queue")
        .delete()
        .eq("application_id", item.application_id)
        .eq("requested_at", item.requested_at)
        .select("application_id")
      if (clearError) throw clearError
      if (cleared?.length) invalidated += 1
    } catch (error) {
      failures += 1
      console.error(`Planning exact-path revalidation failed for ${item.application_id}.`, error)
    }
  }

  const legacyLimit = Math.max(0, limit - (queued?.length ?? 0))
  const legacyQuery = supabase
    .from("planning_applications")
    .select("id,local_authority_code,reference,updated_at")
    .eq("revalidation_pending", true)
    .order("updated_at", { ascending: true })
    .order("id", { ascending: true })
  const { data, error } = legacyLimit > 0
    ? await legacyQuery.limit(legacyLimit)
    : { data: [], error: null }

  if (error) throw new Error(`Planning revalidation queue read failed: ${error.message}`)

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

  const [{ count, error: countError }, { count: queueCount, error: queueCountError }] = await Promise.all([
    supabase
    .from("planning_applications")
    .select("id", { count: "exact", head: true })
    .eq("revalidation_pending", true),
    supabase
      .from("planning_revalidation_queue")
      .select("application_id", { count: "exact", head: true }),
  ])
  if (countError) throw new Error(`Planning revalidation queue count failed: ${countError.message}`)
  if (queueCountError) throw new Error(`Planning exact-path queue count failed: ${queueCountError.message}`)

  return {
    selected: (queued?.length ?? 0) + (data?.length ?? 0),
    invalidated,
    remaining: (count ?? 0) + (queueCount ?? 0),
    failures,
  }
}
