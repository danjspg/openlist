const SAFE_ERROR_KEYS = ["message", "details", "hint", "code", "name", "status"]

function redactPotentialSecrets(value) {
  if (typeof value !== "string") return value
  return value.replace(
    /(sb_(?:secret|publishable|service_role)_[A-Za-z0-9_-]+|eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)/g,
    "[redacted]"
  )
}

function sanitizeForLog(value, seen = new WeakSet()) {
  if (value === null || value === undefined) return value
  if (typeof value === "string") return redactPotentialSecrets(value)
  if (typeof value === "number" || typeof value === "boolean") return value
  if (typeof value === "bigint") return value.toString()
  if (typeof value === "function" || typeof value === "symbol") return String(value)

  if (typeof value !== "object") return String(value)
  if (seen.has(value)) return "[Circular]"
  seen.add(value)

  if (Array.isArray(value)) return value.map((item) => sanitizeForLog(item, seen))

  const output = {}
  for (const [key, item] of Object.entries(value)) {
    if (/secret|token|password|apikey|api_key|authorization|cookie/i.test(key)) {
      output[key] = "[redacted]"
      continue
    }
    output[key] = sanitizeForLog(item, seen)
  }

  return output
}

function pickSupabaseErrorFields(error) {
  if (!error || typeof error !== "object") return null

  const fields = {}
  for (const key of SAFE_ERROR_KEYS) {
    if (error[key] !== undefined && error[key] !== null && error[key] !== "") {
      fields[key] = sanitizeForLog(error[key])
    }
  }

  return Object.keys(fields).length > 0 ? fields : null
}

function stringifyUnknown(value) {
  try {
    return JSON.stringify(sanitizeForLog(value), null, 2)
  } catch {
    try {
      return String(value)
    } catch {
      return "Unknown non-serializable error"
    }
  }
}

function formatErrorForLog(error) {
  if (!error) return "Unknown error"

  if (error instanceof Error) {
    const parts = [`${error.name}: ${error.message}`]
    const causeFields = pickSupabaseErrorFields(error.cause)
    if (causeFields) {
      parts.push(`Cause: ${stringifyUnknown(causeFields)}`)
    } else if (error.cause) {
      parts.push(`Cause: ${stringifyUnknown(error.cause)}`)
    }
    return parts.join("\n")
  }

  if (typeof error === "string") return redactPotentialSecrets(error)

  const supabaseFields = pickSupabaseErrorFields(error)
  if (supabaseFields) return stringifyUnknown(supabaseFields)

  return stringifyUnknown(error)
}

export { formatErrorForLog }
