export function getPublicSiteUrl() {
  const configuredUrl =
    process.env.NEXT_PUBLIC_AUTH_REDIRECT_URL?.trim() ||
    process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
    "https://www.openlist.ie"

  return configuredUrl.replace(/\/+$/, "")
}

export function getSafeRedirectPath(value: string | null | undefined, fallback = "/my-listings") {
  if (!value) return fallback
  if (!value.startsWith("/")) return fallback
  if (value.startsWith("//")) return fallback
  return value
}

export function getSellerAuthRedirectUrl(nextPath: string) {
  const safeNextPath = getSafeRedirectPath(nextPath, "/my-listings")
  return `${getPublicSiteUrl()}/auth/callback?next=${encodeURIComponent(safeNextPath)}`
}
