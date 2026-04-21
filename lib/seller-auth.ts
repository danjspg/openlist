import { createClient, type EmailOtpType, type Session, type User } from "@supabase/supabase-js"
import { cookies } from "next/headers"

export const SELLER_ACCESS_TOKEN_COOKIE = "openlist_seller_access_token"
export const SELLER_REFRESH_TOKEN_COOKIE = "openlist_seller_refresh_token"

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
    const maxAge = Math.max(0, session.expires_at - Math.floor(Date.now() / 1000))
    return maxAge
  }

  return 60 * 60
}

export function isEmailOtpType(value: string | null): value is EmailOtpType {
  return value === "signup" || value === "magiclink" || value === "recovery" || value === "invite" || value === "email" || value === "email_change"
}

export async function getCurrentSellerUser(): Promise<User | null> {
  const cookieStore = await cookies()
  const accessToken = cookieStore.get(SELLER_ACCESS_TOKEN_COOKIE)?.value

  if (!accessToken) return null

  const supabase = getSupabaseAuthClient()
  const { data, error } = await supabase.auth.getUser(accessToken)

  if (error || !data.user) {
    return null
  }

  return data.user
}

export async function requireSellerUser() {
  const user = await getCurrentSellerUser()

  if (!user) {
    throw new Error("Authentication required")
  }

  return user
}

export function applySellerSessionCookies(response: Response, session: Session) {
  const maxAge = getCookieMaxAge(session)
  const secure = process.env.NODE_ENV === "production"

  response.headers.append(
    "Set-Cookie",
    `${SELLER_ACCESS_TOKEN_COOKIE}=${session.access_token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure ? "; Secure" : ""}`
  )
  response.headers.append(
    "Set-Cookie",
    `${SELLER_REFRESH_TOKEN_COOKIE}=${session.refresh_token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure ? "; Secure" : ""}`
  )
}

export function clearSellerSessionCookies(response: Response) {
  const secure = process.env.NODE_ENV === "production"
  response.headers.append(
    "Set-Cookie",
    `${SELLER_ACCESS_TOKEN_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure ? "; Secure" : ""}`
  )
  response.headers.append(
    "Set-Cookie",
    `${SELLER_REFRESH_TOKEN_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure ? "; Secure" : ""}`
  )
}

export function createSupabaseAuthClient() {
  return getSupabaseAuthClient()
}
