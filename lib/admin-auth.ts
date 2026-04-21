import { createHmac, timingSafeEqual } from "crypto"
import { cookies } from "next/headers"

const ADMIN_SESSION_COOKIE = "openlist_admin_session"
const DEFAULT_SESSION_TTL_MS = 1000 * 60 * 60 * 12

type AdminSessionPayload = {
  email: string
  exp: number
}

function normalizeEmail(value: string) {
  return value.trim().toLowerCase()
}

function getAdminEmails() {
  return (process.env.OPENLIST_ADMIN_EMAILS || "")
    .split(",")
    .map(normalizeEmail)
    .filter(Boolean)
}

function getSessionSecret() {
  return process.env.OPENLIST_ADMIN_SESSION_SECRET || ""
}

function getAccessCode() {
  return process.env.OPENLIST_ADMIN_ACCESS_CODE || ""
}

function signPayload(payload: string) {
  return createHmac("sha256", getSessionSecret()).update(payload).digest("base64url")
}

function encodeSession(session: AdminSessionPayload) {
  const payload = Buffer.from(JSON.stringify(session)).toString("base64url")
  const signature = signPayload(payload)
  return `${payload}.${signature}`
}

function decodeSession(value: string | undefined) {
  if (!value) return null

  const [payload, signature] = value.split(".")
  if (!payload || !signature) return null
  if (!getSessionSecret()) return null

  const expected = signPayload(payload)
  const expectedBuffer = Buffer.from(expected)
  const providedBuffer = Buffer.from(signature)

  if (
    expectedBuffer.length !== providedBuffer.length ||
    !timingSafeEqual(expectedBuffer, providedBuffer)
  ) {
    return null
  }

  try {
    const parsed = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8")
    ) as AdminSessionPayload

    if (!parsed.email || !parsed.exp) return null
    if (Date.now() > parsed.exp) return null

    return {
      email: normalizeEmail(parsed.email),
      exp: parsed.exp,
    }
  } catch {
    return null
  }
}

export function isAdminEmail(email: string) {
  return getAdminEmails().includes(normalizeEmail(email))
}

export function isValidAdminAccessCode(accessCode: string) {
  const expected = getAccessCode().trim()
  if (!expected) return false
  return accessCode.trim() === expected
}

export async function getCurrentAdminEmail() {
  const cookieStore = await cookies()
  const session = decodeSession(cookieStore.get(ADMIN_SESSION_COOKIE)?.value)

  if (!session) return null
  if (!isAdminEmail(session.email)) return null

  return session.email
}

export async function getCurrentUserIsAdmin() {
  const email = await getCurrentAdminEmail()
  return Boolean(email)
}

export async function requireAdmin() {
  const email = await getCurrentAdminEmail()

  if (!email) {
    throw new Error("Admin access required")
  }

  return { email }
}

export async function createAdminSession(email: string) {
  const normalizedEmail = normalizeEmail(email)

  if (!isAdminEmail(normalizedEmail)) {
    throw new Error("Unauthorized")
  }

  const cookieStore = await cookies()
  const expires = new Date(Date.now() + DEFAULT_SESSION_TTL_MS)

  cookieStore.set(ADMIN_SESSION_COOKIE, encodeSession({
    email: normalizedEmail,
    exp: expires.getTime(),
  }), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires,
  })
}

export async function clearAdminSession() {
  const cookieStore = await cookies()
  cookieStore.delete(ADMIN_SESSION_COOKIE)
}
