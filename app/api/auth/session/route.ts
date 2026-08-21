import { NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth"
import { getServerSupabase } from "@/lib/supabase"

export async function GET() {
  const user = await getCurrentUser()
  const hasViewings = user
    ? Boolean(
        (
          await getServerSupabase()
            .from("viewings")
            .select("id")
            .eq("owner_user_id", user.id)
            .limit(1)
            .maybeSingle()
        ).data
      )
    : false

  return NextResponse.json(
    { authenticated: Boolean(user), hasViewings },
    {
      headers: {
        "cache-control": "private, no-store, max-age=0",
      },
    }
  )
}
