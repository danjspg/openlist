import { NextResponse } from "next/server"
import { getServerSupabase } from "@/lib/supabase"
import { sendViewingReminderEmails } from "@/lib/viewing-emails"
import type { ViewingRow } from "@/lib/viewings"

export const runtime = "nodejs"

function isAuthorised(request: Request) {
  const secret = process.env.CRON_SECRET

  if (!secret) {
    return process.env.NODE_ENV !== "production"
  }

  return request.headers.get("authorization") === `Bearer ${secret}`
}

export async function GET(request: Request) {
  if (!isAuthorised(request)) {
    return NextResponse.json({ success: false, error: "Unauthorised" }, { status: 401 })
  }

  const supabase = getServerSupabase()
  const now = Date.now()
  const windowStart = new Date(now + 23 * 60 * 60 * 1000).toISOString()
  const windowEnd = new Date(now + 25 * 60 * 60 * 1000).toISOString()

  const { data, error } = await supabase
    .from("viewings")
    .select("*")
    .eq("status", "scheduled")
    .is("reminder_sent_at", null)
    .gte("viewing_starts_at", windowStart)
    .lt("viewing_starts_at", windowEnd)
    .order("viewing_starts_at", { ascending: true })
    .limit(50)

  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }

  const sent: string[] = []
  const failed: { id: string; error: string }[] = []

  for (const viewing of (data ?? []) as ViewingRow[]) {
    try {
      await sendViewingReminderEmails(viewing)

      const { error: updateError } = await supabase
        .from("viewings")
        .update({ reminder_sent_at: new Date().toISOString() })
        .eq("id", viewing.id)
        .is("reminder_sent_at", null)

      if (updateError) {
        throw new Error(updateError.message)
      }

      sent.push(viewing.id)
    } catch (err) {
      failed.push({
        id: viewing.id,
        error: err instanceof Error ? err.message : "Unknown reminder failure",
      })
    }
  }

  return NextResponse.json({
    success: failed.length === 0,
    checked: data?.length ?? 0,
    sent: sent.length,
    failed,
  })
}
