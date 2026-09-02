export const MAINTENANCE_OUTCOMES = Object.freeze({
  HEALTHY: "healthy",
  MISMATCH: "mismatch",
  UNAVAILABLE: "unavailable",
  ERROR: "error",
  SOURCE_DEGRADED: "source_degraded",
})

const TEMPORARY_HTTP_STATUSES = new Set([408, 425, 429, 500, 502, 503, 504])

export function isStatementTimeout(value) {
  const text = String(value instanceof Error ? value.message : value ?? "")
  return /(?:\b57014\b|statement timeout|canceling statement due to statement timeout)/i.test(text)
}

export function isTemporaryHttpStatus(status) {
  return TEMPORARY_HTTP_STATUSES.has(Number(status))
}

export function classifyDatabaseVerificationFailure({ status, body, error } = {}) {
  if (isStatementTimeout(body) || isStatementTimeout(error)) return MAINTENANCE_OUTCOMES.UNAVAILABLE
  if (isTemporaryHttpStatus(status)) return MAINTENANCE_OUTCOMES.UNAVAILABLE
  return MAINTENANCE_OUTCOMES.ERROR
}

export function maintenanceExitCode(outcome, { actionableMismatch = true, degradedIsFailure = false } = {}) {
  if (outcome === MAINTENANCE_OUTCOMES.ERROR) return 1
  if (outcome === MAINTENANCE_OUTCOMES.MISMATCH && actionableMismatch) return 2
  if (outcome === MAINTENANCE_OUTCOMES.SOURCE_DEGRADED && degradedIsFailure) return 3
  return 0
}
