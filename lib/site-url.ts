export function getPublicSiteUrl() {
  const configuredUrl =
    process.env.NEXT_PUBLIC_AUTH_REDIRECT_URL?.trim() ||
    process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
    "https://www.openlist.ie"

  return configuredUrl.replace(/\/+$/, "")
}

export const DEFAULT_ACCOUNT_PATH = "/my-alerts"

export function getSafeRedirectPath(
  value: string | null | undefined,
  fallback = DEFAULT_ACCOUNT_PATH
) {
  if (!value) return fallback
  if (!value.startsWith("/")) return fallback
  if (value.startsWith("//")) return fallback
  if (
    value === "/sell" ||
    value === "/listings" ||
    value.startsWith("/listings/") ||
    value === "/my-listings" ||
    value.startsWith("/my-listings/") ||
    value === "/enquiries"
  ) {
    return fallback
  }
  return value
}

export function getAuthRedirectUrl(nextPath: string, origin?: string) {
  const safeNextPath = getSafeRedirectPath(nextPath, DEFAULT_ACCOUNT_PATH)
  const baseUrl = (origin || getPublicSiteUrl()).replace(/\/+$/, "")
  return `${baseUrl}/auth/callback?next=${encodeURIComponent(safeNextPath)}`
}

export function getAuthCallbackUrl(origin?: string) {
  const baseUrl = (origin || getPublicSiteUrl()).replace(/\/+$/, "")
  return `${baseUrl}/auth/callback`
}
