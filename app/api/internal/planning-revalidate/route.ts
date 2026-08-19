import { revalidatePath } from "next/cache"
import { NextRequest, NextResponse } from "next/server"
import { drainPlanningRevalidationQueue } from "@/lib/planning-revalidation"
import { getServerSupabase } from "@/lib/supabase"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function POST(request: NextRequest) {
  const secret = process.env.PLANNING_REVALIDATION_SECRET
  const supplied = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "")
  if (!secret || !supplied || supplied !== secret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const result = await drainPlanningRevalidationQueue(getServerSupabase(), revalidatePath)
    return NextResponse.json(result)
  } catch (error) {
    console.error("Planning revalidation drain failed.", error)
    return NextResponse.json({ error: "Planning revalidation drain failed" }, { status: 500 })
  }
}
