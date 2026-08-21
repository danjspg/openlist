import { createClient } from "@supabase/supabase-js"

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

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
  })
}

function isConfiguredSupabaseKey(value: string | undefined): value is string {
  // Vercel preview environments may intentionally carry a short placeholder
  // instead of a service-role secret. Public OpenList reads can safely use the
  // configured anon key rather than sending a malformed credential.
  return Boolean(value && value.trim().length >= 32)
}
