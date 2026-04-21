import { NextRequest, NextResponse } from "next/server"
import { applySellerSessionCookies, createSupabaseAuthClient } from "@/lib/seller-auth"
import { getSafeRedirectPath } from "@/lib/site-url"

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const email = typeof body?.email === "string" ? body.email.trim() : ""
    const token = typeof body?.token === "string" ? body.token.trim() : ""
    const next = getSafeRedirectPath(
      typeof body?.next === "string" ? body.next : undefined,
      "/my-listings"
    )

    if (!email || !token) {
      return NextResponse.json(
        { error: "Email and code are required." },
        { status: 400 }
      )
    }

    const supabase = createSupabaseAuthClient()
    const { data, error } = await supabase.auth.verifyOtp({
      email,
      token,
      type: "email",
    })

    if (error || !data.session) {
      return NextResponse.json(
        { error: "That code is no longer valid. Please request a new one." },
        { status: 400 }
      )
    }

    const response = NextResponse.json({ ok: true, redirectTo: next })
    applySellerSessionCookies(response, data.session)
    return response
  } catch {
    return NextResponse.json(
      { error: "Could not verify that code. Please try again." },
      { status: 500 }
    )
  }
}
