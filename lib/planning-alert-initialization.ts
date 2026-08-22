import { createPlanningAlertWatcher } from "@/lib/planning-alert-watch.mjs"
import { getServiceRoleSupabase } from "@/lib/supabase"

export async function initializePlanningAlertWatch(applicationId: string) {
  const watcher = createPlanningAlertWatcher({
    supabase: getServiceRoleSupabase(),
    delayMs: 0,
  })
  return watcher.run(applicationId)
}
