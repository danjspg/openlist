export const SUPABASE_UPSTREAM_TIMEOUT = "SUPABASE_UPSTREAM_TIMEOUT"
export const SUPABASE_OPTIONAL_BACKPRESSURE = "SUPABASE_OPTIONAL_BACKPRESSURE"
export const SUPABASE_REQUEST_BUDGET_MS = 8_000
const SUPABASE_SLOW_CALL_MS = 2_000

type OptionalBreakerOptions = {
  failureThreshold?: number
  failureWindowMs?: number
  resetMs?: number
  maxConcurrent?: number
  now?: () => number
}

export class OptionalSupabaseCircuitBreaker {
  private failures: number[] = []
  private openUntil = 0
  private inFlight = 0
  private readonly failureThreshold: number
  private readonly failureWindowMs: number
  private readonly resetMs: number
  private readonly maxConcurrent: number
  private readonly now: () => number

  constructor(options: OptionalBreakerOptions = {}) {
    this.failureThreshold = options.failureThreshold ?? 3
    this.failureWindowMs = options.failureWindowMs ?? 30_000
    this.resetMs = options.resetMs ?? 15_000
    this.maxConcurrent = options.maxConcurrent ?? 4
    this.now = options.now ?? Date.now
  }

  acquire() {
    const now = this.now()
    this.prune(now)
    if (this.openUntil > now || this.inFlight >= this.maxConcurrent) {
      throw new Error(SUPABASE_OPTIONAL_BACKPRESSURE)
    }
    this.inFlight += 1
    let released = false
    return () => {
      if (released) return
      released = true
      this.inFlight = Math.max(0, this.inFlight - 1)
    }
  }

  recordFailure() {
    const now = this.now()
    this.prune(now)
    this.failures.push(now)
    if (this.failures.length >= this.failureThreshold) {
      this.openUntil = now + this.resetMs
      this.failures = this.failures.slice(-this.failureThreshold)
    }
  }

  recordSuccess() {
    const now = this.now()
    this.prune(now)
    if (this.failures.length) this.failures.shift()
  }

  private prune(now: number) {
    this.failures = this.failures.filter((timestamp) => now - timestamp <= this.failureWindowMs)
    if (this.openUntil <= now) this.openUntil = 0
  }
}

const optionalSupabaseBreaker = new OptionalSupabaseCircuitBreaker()

export async function fetchWithSupabaseBudget(
  fetchImplementation: typeof fetch,
  input: RequestInfo | URL,
  init?: RequestInit,
  budgetMs = SUPABASE_REQUEST_BUDGET_MS,
  options: {
    optional?: boolean
    breaker?: OptionalSupabaseCircuitBreaker
  } = {}
) {
  const breaker = options.breaker ?? optionalSupabaseBreaker
  let release = () => {}
  if (options.optional) {
    try {
      release = breaker.acquire()
    } catch (error) {
      const endpoint = safeSupabaseEndpoint(input)
      console.warn("Optional Supabase call shed by local backpressure", {
        endpoint,
        classification: SUPABASE_OPTIONAL_BACKPRESSURE,
      })
      throw new Error(`${SUPABASE_OPTIONAL_BACKPRESSURE}: ${endpoint}`, { cause: error })
    }
  }
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
    if (options.optional) {
      if (response.status === 429 || response.status >= 500) breaker.recordFailure()
      else breaker.recordSuccess()
    }
    return response
  } catch (error) {
    const durationMs = Date.now() - startedAt
    if (budgetExpired) {
      console.warn("Supabase call exceeded request budget", { endpoint, durationMs, classification: SUPABASE_UPSTREAM_TIMEOUT })
      if (options.optional) breaker.recordFailure()
      throw new Error(`${SUPABASE_UPSTREAM_TIMEOUT}: ${endpoint} exceeded ${budgetMs}ms`, { cause: error })
    }
    if (options.optional && !upstreamSignal?.aborted) breaker.recordFailure()
    throw error
  } finally {
    clearTimeout(timer)
    upstreamSignal?.removeEventListener("abort", abortFromUpstream)
    release()
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
