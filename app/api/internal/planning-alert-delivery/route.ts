import { createHash, timingSafeEqual } from "node:crypto"
import { NextRequest, NextResponse } from "next/server"
import { runPlanningAlertDelivery } from "@/lib/planning-alert-delivery"
import { planningAlertDeliveryIsEnabled } from "@/lib/planning-alert-delivery-rules"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const SUPABASE_CRON_TOKEN_SHA256 = "ad4dc5ad24bf12ffd2d4a1951c7a591515e5d6ee95dc48ccee49d74d0066ade3"

function safeEqual(left: string, right: string) {
  const leftBytes = Buffer.from(left)
  const rightBytes = Buffer.from(right)
  return leftBytes.length === rightBytes.length && timingSafeEqual(leftBytes, rightBytes)
}

function authorised(request: NextRequest) {
  const expected = process.env.PLANNING_ALERT_DELIVERY_SECRET?.trim()
  const supplied = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "")
  if (expected && supplied && safeEqual(expected, supplied)) return true

  const cronToken = request.headers.get("x-openlist-cron-token")?.trim()
  if (!cronToken) return false
  const cronTokenHash = createHash("sha256").update(cronToken).digest("hex")
  return safeEqual(SUPABASE_CRON_TOKEN_SHA256, cronTokenHash)
}

export async function POST(request: NextRequest) {
  if (!authorised(request)) {
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
