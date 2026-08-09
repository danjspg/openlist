import { createClient, type EmailOtpType, type Session, type User } from "@supabase/supabase-js"
import { cookies } from "next/headers"
import type { NextResponse } from "next/server"

// Cookie values keep their historical names so existing signed-in sessions remain valid.
export const ACCESS_TOKEN_COOKIE = "openlist_seller_access_token"
export const REFRESH_TOKEN_COOKIE = "openlist_seller_refresh_token"

function getSupabaseAuthClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    }
  )
}

function getCookieMaxAge(session: Session) {
  if (session.expires_at) {
    return Math.max(0, session.expires_at - Math.floor(Date.now() / 1000))
  }
  return 60 * 60
}

export function isEmailOtpType(value: string | null): value is EmailOtpType {
  return value === "signup" || value === "magiclink" || value === "recovery" || value === "invite" || value === "email" || value === "email_change"
}

export async function getCurrentUser(): Promise<User | null> {
  const cookieStore = await cookies()
  const accessToken = cookieStore.get(ACCESS_TOKEN_COOKIE)?.value
  if (!accessToken) return null

  const { data, error } = await getSupabaseAuthClient().auth.getUser(accessToken)
  return error || !data.user ? null : data.user
}

export async function requireUser() {
  const user = await getCurrentUser()
  if (!user) throw new Error("Authentication required")
  return user
}

export function applySessionCookies(response: NextResponse, session: Session) {
  const options = {
    path: "/",
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    maxAge: getCookieMaxAge(session),
  }
  response.cookies.set(ACCESS_TOKEN_COOKIE, session.access_token, options)
  response.cookies.set(REFRESH_TOKEN_COOKIE, session.refresh_token, options)
}

export function clearSessionCookies(response: NextResponse) {
  const options = {
    path: "/",
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    maxAge: 0,
  }
  response.cookies.set(ACCESS_TOKEN_COOKIE, "", options)
  response.cookies.set(REFRESH_TOKEN_COOKIE, "", options)
}

export function createAuthClient() {
  return getSupabaseAuthClient()
}
