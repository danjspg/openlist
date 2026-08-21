import { createHmac, timingSafeEqual } from "node:crypto"

const TOKEN_VERSION = "v1"
const SUBSCRIPTION_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function unsubscribeSecret() {
  const secret = process.env.PLANNING_ALERT_UNSUBSCRIBE_SECRET?.trim()
  if (!secret || secret.length < 32) {
    throw new Error("PLANNING_ALERT_UNSUBSCRIBE_SECRET must be at least 32 characters")
  }
  return secret
}

function signature(subscriptionId: string) {
  return createHmac("sha256", unsubscribeSecret())
    .update(`${TOKEN_VERSION}:${subscriptionId}`)
    .digest("base64url")
}

export function createPlanningAlertUnsubscribeToken(subscriptionId: string) {
  if (!SUBSCRIPTION_ID_PATTERN.test(subscriptionId)) {
    throw new Error("A valid planning alert subscription ID is required")
  }
  return `${TOKEN_VERSION}.${subscriptionId}.${signature(subscriptionId)}`
}

export function verifyPlanningAlertUnsubscribeToken(token: string | null | undefined) {
  if (!token || token.length > 256) return null
  const [version, subscriptionId, suppliedSignature, extra] = token.split(".")
  if (extra || version !== TOKEN_VERSION || !SUBSCRIPTION_ID_PATTERN.test(subscriptionId || "")) {
    return null
  }

  const expected = Buffer.from(signature(subscriptionId), "base64url")
  const supplied = Buffer.from(suppliedSignature || "", "base64url")
  if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) return null
  return subscriptionId
}
