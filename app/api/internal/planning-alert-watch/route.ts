import { createHash, timingSafeEqual } from "node:crypto"
import { NextRequest, NextResponse } from "next/server"
import { createPlanningAlertWatcher } from "@/lib/planning-alert-watch.mjs"
import { getServiceRoleSupabase } from "@/lib/supabase"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 300

const BATCH_LIMIT = 100
const WATCH_DELAY_MS = 750
const SERVICE_LEVELS = new Set(["fast", "standard"])

function safeEqual(left: string, right: string) {
  const leftBytes = Buffer.from(left)
  const rightBytes = Buffer.from(right)
  return leftBytes.length === rightBytes.length && timingSafeEqual(leftBytes, rightBytes)
}

async function authorised(request: NextRequest) {
  const cronToken = request.headers.get("x-openlist-cron-token")?.trim()
  if (!cronToken) return false

  const { data, error } = await getServiceRoleSupabase()
    .from("openlist_internal_secrets")
    .select("secret_hash")
    .eq("name", "planning_alert_delivery_cron")
    .maybeSingle()

  if (error || !data?.secret_hash) return false
  const cronTokenHash = createHash("sha256").update(cronToken).digest("hex")
  return safeEqual(data.secret_hash, cronTokenHash)
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export async function POST(request: NextRequest) {
  if (!(await authorised(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const body = await request.json().catch(() => ({})) as { serviceLevel?: string }
  const serviceLevel = String(body.serviceLevel ?? "").trim()
  if (!SERVICE_LEVELS.has(serviceLevel)) {
    return NextResponse.json({ error: "serviceLevel must be fast or standard." }, { status: 400 })
  }

  const supabase = getServiceRoleSupabase()
  const { data, error } = await supabase.rpc("openlist_select_planning_alert_watch_batch", {
    p_service_level: serviceLevel,
    p_limit: BATCH_LIMIT,
  })

  if (error) {
    console.error("Planning alert watch batch selection failed.", error)
    return NextResponse.json({ error: "Planning alert watch batch selection failed." }, { status: 500 })
  }

  const applicationIds = (data ?? [])
    .map((row: { application_id?: string | null }) => row.application_id)
    .filter((id: string | null | undefined): id is string => Boolean(id))

  const watcher = createPlanningAlertWatcher({ supabase, delayMs: 0 })
  const report = {
    serviceLevel,
    selected: applicationIds.length,
    initialized: 0,
    checked: 0,
    changed: 0,
    sourceFailures: 0,
    processingFailures: 0,
  }

  for (const applicationId of applicationIds) {
    try {
      const result = await watcher.run(applicationId)
      report.initialized += result.initialized
      report.checked += result.checked
      report.changed += result.changed
      report.sourceFailures += result.failures
    } catch (watchError) {
      report.processingFailures += 1
      console.error(`Planning alert watch failed for ${applicationId}.`, watchError)
    }
    if (WATCH_DELAY_MS > 0) await sleep(WATCH_DELAY_MS)
  }

  return NextResponse.json(report)
}
