"use server"

import { redirect } from "next/navigation"
import {
  clearAdminSession,
  createAdminSession,
  isAdminEmail,
  isValidAdminAccessCode,
} from "@/lib/admin-auth"

export async function grantAdminAccess(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim().toLowerCase()
  const accessCode = String(formData.get("accessCode") ?? "")
  const returnTo = String(formData.get("returnTo") ?? "/").trim() || "/"

  if (!isAdminEmail(email) || !isValidAdminAccessCode(accessCode)) {
    redirect(`/admin/access?error=1&returnTo=${encodeURIComponent(returnTo)}`)
  }

  await createAdminSession(email)
  redirect(returnTo)
}

export async function revokeAdminAccess(formData: FormData) {
  const returnTo = String(formData.get("returnTo") ?? "/").trim() || "/"
  await clearAdminSession()
  redirect(returnTo)
}
