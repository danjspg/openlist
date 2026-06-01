import { NextRequest, NextResponse } from "next/server"
import type { EmailOtpType } from "@supabase/supabase-js"
import { getSafeRedirectPath } from "@/lib/site-url"
import {
  applySellerSessionCookies,
  createSupabaseAuthClient,
  isEmailOtpType,
} from "@/lib/seller-auth"

async function verifyEmailToken(tokenHash: string, type: EmailOtpType) {
  const supabase = createSupabaseAuthClient()
  const attempts: EmailOtpType[] =
    type === "email"
      ? ["email", "magiclink"]
      : type === "magiclink"
        ? ["magiclink", "email"]
        : [type]

  let lastError: unknown = null

  for (const attemptType of attempts) {
    const { data, error } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type: attemptType,
    })

    if (!error && data.session) {
      return data.session
    }

    lastError = error
  }

  console.error("Seller auth callback failed", {
    type,
    error: lastError instanceof Error ? lastError.message : "No session returned",
  })

  return null
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url)
  const tokenHash = url.searchParams.get("token_hash")
  const type = url.searchParams.get("type")
  const cookieNext = request.cookies.get("openlist_auth_next")?.value
  const next = getSafeRedirectPath(
    url.searchParams.get("next") || (cookieNext ? decodeURIComponent(cookieNext) : null),
    "/my-listings"
  )

  if (!tokenHash || !isEmailOtpType(type)) {
    return NextResponse.redirect(new URL(`/sign-in?error=invalid_link&redirectTo=${encodeURIComponent(next)}`, request.url))
  }

  const session = await verifyEmailToken(tokenHash, type)

  if (!session) {
    return NextResponse.redirect(new URL(`/sign-in?error=invalid_link&redirectTo=${encodeURIComponent(next)}`, request.url))
  }

  const response = NextResponse.redirect(new URL(next, request.url))
  applySellerSessionCookies(response, session)
  response.cookies.set("openlist_auth_next", "", {
    path: "/",
    maxAge: 0,
  })
  return response
}
