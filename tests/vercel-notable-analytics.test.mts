import assert from "node:assert/strict"
import test from "node:test"
import { aggregateNotableDimensions, parsePlanningApplicationPath } from "../scripts/report-vercel-analytics.mts"
import { topVercelDimension, topVercelEvents } from "../lib/vercel-web-analytics"

test("parses Planning application paths into authority and reference", () => {
  const parsed = parsePlanningApplicationPath("/planning/cork/ref-MjYvMTY0NA")
  assert.deepEqual(parsed, { authorityCode: "CORKCOCO", reference: "26/1644" })
  assert.equal(parsePlanningApplicationPath("/planning/cork"), null)
  assert.equal(parsePlanningApplicationPath("/sold-prices/search"), null)
})

test("aggregates notable traffic by overlapping categories and sources", () => {
  const rows = [
    { requestPath: "/a", visitors: 10, pageviews: 15 },
    { requestPath: "/b", visitors: 4, pageviews: 8 },
  ]
  const metadata = new Map([
    ["/a", { displayName: "A", categories: ["retail", "commercial"], sources: ["deterministic"] }],
    ["/b", { displayName: "B", categories: ["retail"], sources: ["press"] }],
  ])
  const result = aggregateNotableDimensions(rows, metadata)
  assert.deepEqual(result.categories.get("retail"), { visitors: 14, pageviews: 23, pages: 2 })
  assert.deepEqual(result.categories.get("commercial"), { visitors: 10, pageviews: 15, pages: 1 })
  assert.deepEqual(result.sources.get("press"), { visitors: 4, pageviews: 8, pages: 1 })
})

test("queries arbitrary visit dimensions with bounded aggregate requests", async () => {
  const originalFetch = globalThis.fetch
  let requestedUrl = ""
  globalThis.fetch = (async (input: string | URL | Request) => {
    requestedUrl = String(input)
    return new Response(JSON.stringify({
      data: [
        { referrerHostname: "google.com", visitors: 12, pageviews: 20 },
        { referrerHostname: "Others", visitors: 3, pageviews: 4 },
      ],
    }), { status: 200, headers: { "content-type": "application/json" } })
  }) as typeof fetch

  try {
    const rows = await topVercelDimension(
      { token: "token", projectId: "project", teamId: "team" },
      new Date("2026-08-01T00:00:00Z"),
      new Date("2026-08-28T00:00:00Z"),
      "referrerHostname",
      500
    )
    assert.match(requestedUrl, /web-analytics\/visits\/aggregate/)
    assert.match(requestedUrl, /by=referrerHostname/)
    assert.match(requestedUrl, /limit=100/)
    assert.deepEqual(rows[0], { value: "google.com", visitors: 12, pageviews: 20 })
  } finally {
    globalThis.fetch = originalFetch
  }
})

test("queries custom events by eventName", async () => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = (async () => new Response(JSON.stringify({
    data: [{ eventName: "planning_alert_created", count: 7, visitors: 6 }],
  }), { status: 200, headers: { "content-type": "application/json" } })) as typeof fetch

  try {
    const rows = await topVercelEvents(
      { token: "token", projectId: "project", teamId: "team" },
      new Date("2026-08-01T00:00:00Z"),
      new Date("2026-08-28T00:00:00Z")
    )
    assert.deepEqual(rows, [{ eventName: "planning_alert_created", count: 7, visitors: 6 }])
  } finally {
    globalThis.fetch = originalFetch
  }
})
