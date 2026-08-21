import { NextRequest, NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth"
import { getPlanningAlertSubscription } from "@/lib/planning-alerts"

export const dynamic = "force-dynamic"

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ applicationId: string }> }
) {
  const currentUser = await getCurrentUser()
  if (!currentUser) return NextResponse.json({ subscription: null })

  const { applicationId } = await params
  if (!UUID_PATTERN.test(applicationId)) {
    return NextResponse.json({ error: "Invalid planning application." }, { status: 400 })
  }

  try {
    const subscription = await getPlanningAlertSubscription(currentUser.id, applicationId)
    return NextResponse.json({ subscription })
  } catch (error) {
    console.error("Could not load planning alert subscription", error)
    return NextResponse.json({ error: "Could not load alert." }, { status: 500 })
  }
}
