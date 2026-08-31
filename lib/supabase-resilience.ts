export const SUPABASE_UPSTREAM_TIMEOUT = "SUPABASE_UPSTREAM_TIMEOUT"
export const SUPABASE_REQUEST_BUDGET_MS = 8_000
const SUPABASE_SLOW_CALL_MS = 2_000

export async function fetchWithSupabaseBudget(
  fetchImplementation: typeof fetch,
  input: RequestInfo | URL,
  init?: RequestInit,
  budgetMs = SUPABASE_REQUEST_BUDGET_MS
) {
  const controller = new AbortController()
  const upstreamSignal = init?.signal
  const endpoint = safeSupabaseEndpoint(input)
  let budgetExpired = false
  const startedAt = Date.now()
  const abortFromUpstream = () => controller.abort(upstreamSignal?.reason)
  if (upstreamSignal?.aborted) abortFromUpstream()
  else upstreamSignal?.addEventListener("abort", abortFromUpstream, { once: true })
  const timer = setTimeout(() => {
    budgetExpired = true
    controller.abort(new Error(`${SUPABASE_UPSTREAM_TIMEOUT}: ${endpoint}`))
  }, budgetMs)

  try {
    const response = await fetchImplementation(input, { ...init, signal: controller.signal })
    const durationMs = Date.now() - startedAt
    if (durationMs >= SUPABASE_SLOW_CALL_MS) {
      console.warn("Supabase slow call", { endpoint, durationMs, status: response.status })
    }
    return response
  } catch (error) {
    const durationMs = Date.now() - startedAt
    if (budgetExpired) {
      console.warn("Supabase call exceeded request budget", { endpoint, durationMs, classification: SUPABASE_UPSTREAM_TIMEOUT })
      throw new Error(`${SUPABASE_UPSTREAM_TIMEOUT}: ${endpoint} exceeded ${budgetMs}ms`, { cause: error })
    }
    throw error
  } finally {
    clearTimeout(timer)
    upstreamSignal?.removeEventListener("abort", abortFromUpstream)
  }
}

function safeSupabaseEndpoint(input: RequestInfo | URL) {
  try {
    const raw = input instanceof Request ? input.url : String(input)
    return new URL(raw).pathname
  } catch {
    return "supabase-request"
  }
}
