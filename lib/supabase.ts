import { createClient } from "@supabase/supabase-js"

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

const RETRYABLE_READ_STATUSES = new Set([429, 500, 502, 503, 504])

async function isRetryableSupabaseReadResponse(response: Response) {
  if (!RETRYABLE_READ_STATUSES.has(response.status)) return false
  if (response.status !== 500) return true

  try {
    const body = (await response.clone().text()).toLowerCase()
    return (
      body.includes("schema cache") ||
      body.includes("connection pool") ||
      body.includes("statement timeout") ||
      body.includes("timed out") ||
      body.includes("temporarily unavailable")
    )
  } catch {
    return false
  }
}

const resilientServerFetch: typeof fetch = async (input, init) => {
  const method = String(init?.method ?? "GET").toUpperCase()
  const retryableMethod = method === "GET" || method === "HEAD"
  let response = await fetch(input, init)

  for (let attempt = 1; retryableMethod && attempt < 3; attempt += 1) {
    if (!(await isRetryableSupabaseReadResponse(response))) break
    await new Promise((resolve) => setTimeout(resolve, attempt * 150))
    response = await fetch(input, init)
  }

  return response
}

export function getServerSupabase() {
  const serverKey = isConfiguredSupabaseKey(supabaseServiceRoleKey)
    ? supabaseServiceRoleKey
    : supabaseAnonKey

  return createClient(
    supabaseUrl,
    serverKey,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
      global: {
        fetch: resilientServerFetch,
      },
    }
  )
}

export function getServiceRoleSupabase() {
  if (!isConfiguredSupabaseKey(supabaseServiceRoleKey)) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is required for this server operation")
  }

  return createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
    global: {
      fetch: resilientServerFetch,
    },
  })
}

function isConfiguredSupabaseKey(value: string | undefined): value is string {
  // Vercel preview environments may intentionally carry a short placeholder
  // instead of a service-role secret. Public OpenList reads can safely use the
  // configured anon key rather than sending a malformed credential.
  return Boolean(value && value.trim().length >= 32)
}
