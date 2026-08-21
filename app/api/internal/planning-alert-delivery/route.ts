import { timingSafeEqual } from "node:crypto"
import { NextRequest, NextResponse } from "next/server"
import { runPlanningAlertDelivery } from "@/lib/planning-alert-delivery"
import { planningAlertDeliveryIsEnabled } from "@/lib/planning-alert-delivery-rules"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function authorised(request: NextRequest) {
  const expected = process.env.PLANNING_ALERT_DELIVERY_SECRET?.trim()
  const supplied = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "")
  if (!expected || !supplied) return false
  const expectedBytes = Buffer.from(expected)
  const suppliedBytes = Buffer.from(supplied)
  return expectedBytes.length === suppliedBytes.length && timingSafeEqual(expectedBytes, suppliedBytes)
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
