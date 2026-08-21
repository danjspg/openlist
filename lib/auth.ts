import { createClient, type EmailOtpType, type Session, type User } from "@supabase/supabase-js"
import { cookies } from "next/headers"
import type { NextResponse } from "next/server"

// Cookie values keep their historical names so existing signed-in sessions remain valid.
export const ACCESS_TOKEN_COOKIE = "openlist_seller_access_token"
export const REFRESH_TOKEN_COOKIE = "openlist_seller_refresh_token"
export const SESSION_COOKIE_MAX_AGE = 60 * 60 * 24 * 90

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

function sessionCookieOptions(maxAge = SESSION_COOKIE_MAX_AGE) {
  return {
    path: "/",
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    maxAge,
  }
}

async function persistRefreshedSession(session: Session) {
  const cookieStore = await cookies()
  const options = sessionCookieOptions()

  try {
    cookieStore.set(ACCESS_TOKEN_COOKIE, session.access_token, options)
    cookieStore.set(REFRESH_TOKEN_COOKIE, session.refresh_token, options)
  } catch {
    // Server Components can read cookies but cannot mutate them. Returning the
    // refreshed user still keeps the current render authenticated; route handlers
    // and Server Actions persist the rotated session when they call this helper.
  }
}

export function isEmailOtpType(value: string | null): value is EmailOtpType {
  return value === "signup" || value === "magiclink" || value === "recovery" || value === "invite" || value === "email" || value === "email_change"
}

export async function getCurrentUser(): Promise<User | null> {
  const cookieStore = await cookies()
  const accessToken = cookieStore.get(ACCESS_TOKEN_COOKIE)?.value
  const refreshToken = cookieStore.get(REFRESH_TOKEN_COOKIE)?.value
  const auth = getSupabaseAuthClient().auth

  if (accessToken) {
    const { data, error } = await auth.getUser(accessToken)
    if (!error && data.user) return data.user
  }

  if (!refreshToken) return null

  const { data, error } = await auth.refreshSession({ refresh_token: refreshToken })
  if (error || !data.session || !data.user) return null

  await persistRefreshedSession(data.session)
  return data.user
}

export async function requireUser() {
  const user = await getCurrentUser()
  if (!user) throw new Error("Authentication required")
  return user
}

export function applySessionCookies(response: NextResponse, session: Session) {
  const options = sessionCookieOptions()
  response.cookies.set(ACCESS_TOKEN_COOKIE, session.access_token, options)
  response.cookies.set(REFRESH_TOKEN_COOKIE, session.refresh_token, options)
}

export function clearSessionCookies(response: NextResponse) {
  const options = sessionCookieOptions(0)
  response.cookies.set(ACCESS_TOKEN_COOKIE, "", options)
  response.cookies.set(REFRESH_TOKEN_COOKIE, "", options)
}

export function createAuthClient() {
  return getSupabaseAuthClient()
}
