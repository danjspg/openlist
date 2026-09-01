import assert from "node:assert/strict"
import test from "node:test"
import { readFile } from "node:fs/promises"
import {
  fetchWithSupabaseBudget,
  OptionalSupabaseCircuitBreaker,
  SUPABASE_OPTIONAL_BACKPRESSURE,
  SUPABASE_UPSTREAM_TIMEOUT,
} from "@/lib/supabase-resilience"

test("an unavailable Supabase request is aborted within its explicit budget", async () => {
  let observedAbort = false
  const neverResponds: typeof fetch = async (_input, init) => new Promise((_resolve, reject) => {
    init?.signal?.addEventListener("abort", () => {
      observedAbort = true
      reject(init.signal?.reason)
    }, { once: true })
  })

  const startedAt = Date.now()
  await assert.rejects(
    fetchWithSupabaseBudget(
      neverResponds,
      "https://example.supabase.co/rest/v1/planning_applications?select=secret",
      undefined,
      25
    ),
    new RegExp(SUPABASE_UPSTREAM_TIMEOUT)
  )
  assert.equal(observedAbort, true)
  assert.ok(Date.now() - startedAt < 500)
})

test("Supabase diagnostics omit query strings and values", async () => {
  const warnings: unknown[][] = []
  const originalWarn = console.warn
  console.warn = (...values: unknown[]) => warnings.push(values)
  try {
    const slowEnoughForTest: typeof fetch = async (_input, init) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(init.signal?.reason), { once: true })
    })
    await fetchWithSupabaseBudget(
      slowEnoughForTest,
      "https://example.supabase.co/rest/v1/planning_applications?reference=eq.SENSITIVE",
      undefined,
      5
    ).catch(() => undefined)
  } finally {
    console.warn = originalWarn
  }

  const diagnostic = JSON.stringify(warnings)
  assert.match(diagnostic, /\/rest\/v1\/planning_applications/)
  assert.doesNotMatch(diagnostic, /SENSITIVE/)
})

test("optional reads open a short process-local circuit after repeated upstream failures", async () => {
  let now = 1_000
  const breaker = new OptionalSupabaseCircuitBreaker({
    failureThreshold: 3,
    failureWindowMs: 30_000,
    resetMs: 15_000,
    now: () => now,
  })
  let calls = 0
  const unavailable: typeof fetch = async () => {
    calls += 1
    return new Response(null, { status: 503 })
  }

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const response = await fetchWithSupabaseBudget(
      unavailable,
      "https://example.supabase.co/rest/v1/optional_view?select=SENSITIVE",
      undefined,
      50,
      { optional: true, breaker }
    )
    assert.equal(response.status, 503)
  }

  await assert.rejects(
    fetchWithSupabaseBudget(
      unavailable,
      "https://example.supabase.co/rest/v1/optional_view?select=OTHER_SECRET",
      undefined,
      50,
      { optional: true, breaker }
    ),
    new RegExp(SUPABASE_OPTIONAL_BACKPRESSURE)
  )
  assert.equal(calls, 3)

  now += 15_001
  const recovered = await fetchWithSupabaseBudget(
    async () => new Response(null, { status: 200 }),
    "https://example.supabase.co/rest/v1/optional_view",
    undefined,
    50,
    { optional: true, breaker }
  )
  assert.equal(recovered.status, 200)
})

test("optional concurrency is bounded without blocking core exact reads", async () => {
  const breaker = new OptionalSupabaseCircuitBreaker({ maxConcurrent: 1 })
  let releaseFirst!: () => void
  const held = new Promise<void>((resolve) => { releaseFirst = resolve })
  const slowOptional: typeof fetch = async () => {
    await held
    return new Response(null, { status: 200 })
  }

  const first = fetchWithSupabaseBudget(
    slowOptional,
    "https://example.supabase.co/rest/v1/decorative",
    undefined,
    500,
    { optional: true, breaker }
  )
  await Promise.resolve()

  await assert.rejects(
    fetchWithSupabaseBudget(
      slowOptional,
      "https://example.supabase.co/rest/v1/decorative",
      undefined,
      500,
      { optional: true, breaker }
    ),
    new RegExp(SUPABASE_OPTIONAL_BACKPRESSURE)
  )

  const core = await fetchWithSupabaseBudget(
    async () => new Response(null, { status: 200 }),
    "https://example.supabase.co/rest/v1/planning_applications",
    undefined,
    50,
    { optional: false, breaker }
  )
  assert.equal(core.status, 200)
  releaseFirst()
  assert.equal((await first).status, 200)
})

test("sold-price locality cards cannot fan out into per-neighbour insight reads", async () => {
  const source = await readFile("app/sold-prices/[county]/[areaSlug]/page.tsx", "utf8")
  assert.doesNotMatch(source, /nearbyAreaCandidates\.map\s*\(\s*async/)
  assert.doesNotMatch(source, /getNearbyAreaLinks|getPlanningApplicationsForSoldPriceArea/)
  assert.match(source, /Both journeys remain available as links without delaying this page/)
})
