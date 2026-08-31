import assert from "node:assert/strict"
import test from "node:test"
import { readFile } from "node:fs/promises"
import {
  fetchWithSupabaseBudget,
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

test("sold-price locality cards cannot fan out into per-neighbour insight reads", async () => {
  const source = await readFile("app/sold-prices/[county]/[areaSlug]/page.tsx", "utf8")
  assert.doesNotMatch(source, /nearbyAreaCandidates\.map\s*\(\s*async/)
  assert.match(source, /const nearbyAreas = nearbyAreaCandidates/)
})
