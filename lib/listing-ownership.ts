export function isMissingOwnerUserIdColumnError(error: unknown) {
  const message =
    typeof error === "string"
      ? error
      : error && typeof error === "object" && "message" in error
        ? String(error.message)
        : ""

  return (
    message.includes("owner_user_id") &&
    (message.includes("does not exist") ||
      message.includes("schema cache") ||
      message.includes("Could not find"))
  )
}

export const LISTING_OWNERSHIP_MIGRATION_MESSAGE =
  "Listing ownership has not been enabled on this environment yet. Please apply the latest listings migration and try again."
