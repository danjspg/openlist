import { getPlanningAuthorityByCode } from "@/lib/planning-authorities"
import { planningApplicationPath } from "@/lib/property-intelligence"
import { getServerSupabase } from "@/lib/supabase"

type QueuedApplication = {
  application_id: string
  requested_at: string
  planning_applications: {
    id: string
    local_authority_code: string
    reference: string
  } | Array<{
    id: string
    local_authority_code: string
    reference: string
  }> | null
}

type QueueClient = ReturnType<typeof getServerSupabase>

type SupabaseMutationResult<T> = {
  data: T | null
  error: { code?: string; message?: string } | null
}

export type PlanningRevalidationResult = {
  selected: number
  invalidated: number
  remaining: number
  failures: number
  oldestRequestedAt: string | null
}

function isTransientMutationError(error: { code?: string; message?: string } | null) {
  if (!error) return false
  const message = String(error.message ?? "").toLowerCase()
  return (
    error.code === "57014" ||
    error.code === "55P03" ||
    message.includes("statement timeout") ||
    message.includes("lock timeout") ||
    message.includes("timed out") ||
    message.includes("connection pool")
  )
}

async function retryTransientMutation<T>(
  operation: () => PromiseLike<SupabaseMutationResult<T>>,
  attempts = 3
) {
  let result = await operation()
  for (let attempt = 1; attempt < attempts && isTransientMutationError(result.error); attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 150 * attempt))
    result = await operation()
  }
  return result
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
      const { data: cleared, error: clearError } = await retryTransientMutation(() =>
        supabase
          .from("planning_revalidation_queue")
          .delete()
          .eq("application_id", item.application_id)
          .eq("requested_at", item.requested_at)
          .select("application_id")
      )
      if (clearError) throw clearError
      if (cleared?.length) invalidated += 1
    } catch (error) {
      failures += 1
      console.error(`Planning exact-path revalidation failed for ${item.application_id}.`, error)
    }
  }

  const { data: oldestQueued, count: queueCount, error: queueCountError } = await supabase
    .from("planning_revalidation_queue")
    .select("requested_at", { count: "exact" })
    .order("requested_at", { ascending: true })
    .limit(1)
  if (queueCountError) throw new Error(`Planning exact-path queue count failed: ${queueCountError.message}`)

  return {
    selected: queued?.length ?? 0,
    invalidated,
    remaining: queueCount ?? 0,
    failures,
    oldestRequestedAt: oldestQueued?.[0]?.requested_at ?? null,
  }
}
