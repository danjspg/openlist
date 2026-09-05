import { createHash, timingSafeEqual } from "node:crypto"
import { NextRequest, NextResponse } from "next/server"
import { runPlanningAlertDelivery } from "@/lib/planning-alert-delivery"
import { planningAlertDeliveryIsEnabled } from "@/lib/planning-alert-delivery-rules"
import { getServiceRoleSupabase } from "@/lib/supabase"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function safeEqual(left: string, right: string) {
  const leftBytes = Buffer.from(left)
  const rightBytes = Buffer.from(right)
  return leftBytes.length === rightBytes.length && timingSafeEqual(leftBytes, rightBytes)
}

async function authorised(request: NextRequest) {
  const expected = process.env.PLANNING_ALERT_DELIVERY_SECRET?.trim()
  const supplied = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "")
  if (expected && supplied && safeEqual(expected, supplied)) return true

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

export async function POST(request: NextRequest) {
  if (!(await authorised(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  if (!planningAlertDeliveryIsEnabled()) {
    return NextResponse.json({ enabled: false, message: "Planning alert delivery is disabled." })
  }

  try {
    return NextResponse.json({ enabled: true, ...(await runPlanningAlertDelivery()) })
  } catch (error) {
    console.error("Planning alert delivery run failed.", error)
    return NextResponse.json({ error: "Planning alert delivery run failed." }, { status: 500 })
  }
}
