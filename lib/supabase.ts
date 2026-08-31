import {
  createClient,
  type SupabaseClient,
  type SupabaseClientOptions,
} from "@supabase/supabase-js"
import { fetchWithSupabaseBudget } from "@/lib/supabase-resilience"

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
export const SUPABASE_BUILD_READ_MARKER = "OPENLIST_SUPABASE_READ_DURING_BUILD"

export const supabase = createOpenListClient(supabaseUrl, supabaseAnonKey)

export function getServerSupabase() {
  const serverKey = isConfiguredSupabaseKey(supabaseServiceRoleKey)
    ? supabaseServiceRoleKey
    : supabaseAnonKey

  return createOpenListClient(
    supabaseUrl,
    serverKey,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    }
  )
}

export function getServiceRoleSupabase() {
  if (!isConfiguredSupabaseKey(supabaseServiceRoleKey)) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is required for this server operation")
  }

  return createOpenListClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  })
}

function createOpenListClient(
  url: string,
  key: string,
  options: SupabaseClientOptions<"public"> = {}
): SupabaseClient {
  const denyBuildRead = process.env.NEXT_PHASE === "phase-production-build"
    || process.env.OPENLIST_AUDIT_SUPABASE_BUILD_READS === "1"

  const client = createClient(url, key, {
    ...options,
    global: {
      ...options.global,
      fetch: denyBuildRead
        ? async (input: RequestInfo | URL) => {
          throw new Error(`${SUPABASE_BUILD_READ_MARKER}: ${String(input)}`)
        }
        : (input, init) => fetchWithSupabaseBudget(
            options.global?.fetch ?? globalThis.fetch,
            input,
            init
          ),
    },
  })

  // supabase-js 2.103 enables PostgREST retries in postgrest-js but does not yet
  // expose the documented db.retry option through SupabaseClientOptions. Set the
  // underlying client default once so callers cannot amplify a saturated API.
  ;(client as unknown as { rest: { retry?: boolean } }).rest.retry = false
  return client
}

function isConfiguredSupabaseKey(value: string | undefined): value is string {
  // Vercel preview environments may intentionally carry a short placeholder
  // instead of a service-role secret. Public OpenList reads can safely use the
  // configured anon key rather than sending a malformed credential.
  return Boolean(value && value.trim().length >= 32)
}
