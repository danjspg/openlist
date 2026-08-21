import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"
import { canCancelViewing } from "@/lib/viewings"

async function source(path: string) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8")
}

const now = Date.parse("2026-08-21T12:00:00.000Z")

test("a future scheduled viewing remains cancellable", () => {
  assert.equal(
    canCancelViewing("scheduled", "2026-08-21T13:00:00.000Z", now),
    true
  )
})

test("a past scheduled viewing is not cancellable", () => {
  assert.equal(
    canCancelViewing("scheduled", "2026-08-21T11:59:59.000Z", now),
    false
  )
})

test("past viewing cancellation is stopped before any update or cancellation email", async () => {
  const actions = await source("app/my-viewings/actions.ts")
  const guard = actions.indexOf("if (!canCancelViewing(existing.status, existing.viewing_starts_at, cancellationStartedAt.getTime()))")
  const update = actions.indexOf('.update({\n      status: "cancelled"')
  const email = actions.indexOf("await sendViewingCancellationEmails")

  assert.ok(guard >= 0)
  assert.match(actions, /throw new Error\("Past viewings cannot be cancelled\."\)/)
  assert.match(actions, /\.gt\("viewing_starts_at", cancellationStartedAt\.toISOString\(\)\)/)
  assert.ok(update > guard)
  assert.ok(email > update)
})

test("list and detail views only render cancellation when the viewing is cancellable", async () => {
  const [listPage, detailPage] = await Promise.all([
    source("app/my-viewings/page.tsx"),
    source("app/my-viewings/[id]/page.tsx"),
  ])

  assert.match(listPage, /const canCancel = canCancelViewing\(viewing\.status, viewing\.viewing_starts_at, now\)/)
  assert.match(listPage, /\{canCancel && \(\s*<form action=\{cancelViewing\}>/)
  assert.match(detailPage, /const canCancel = canCancelViewing\(viewing\.status, viewing\.viewing_starts_at, now\)/)
  assert.match(detailPage, /\{canCancel && \(\s*<form action=\{cancelViewing\}>/)
})
