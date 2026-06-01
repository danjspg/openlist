import { NextRequest, NextResponse } from "next/server"
import { getSafeRedirectPath } from "@/lib/site-url"
import {
  applySellerSessionCookies,
  createSupabaseAuthClient,
  isEmailOtpType,
} from "@/lib/seller-auth"

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

  const supabase = createSupabaseAuthClient()
  const { data, error } = await supabase.auth.verifyOtp({
    token_hash: tokenHash,
    type,
  })

  if (error || !data.session) {
    return NextResponse.redirect(new URL(`/sign-in?error=invalid_link&redirectTo=${encodeURIComponent(next)}`, request.url))
  }

  const response = NextResponse.redirect(new URL(next, request.url))
  applySellerSessionCookies(response, data.session)
  response.cookies.set("openlist_auth_next", "", {
    path: "/",
    maxAge: 0,
  })
  return response
}
