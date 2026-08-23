import assert from "node:assert/strict"
import test from "node:test"

import {
  CORK_DETAIL_REQUEST_DELAY_MS,
  corkRetryDelayMs,
  CorkRequestThrottle,
  retryAfterDelayMs,
} from "../lib/cork-request-throttle"

test("Cork request throttle spaces request starts by at least one second", async () => {
  let now = 0
  const waits: number[] = []
  const throttle = new CorkRequestThrottle(CORK_DETAIL_REQUEST_DELAY_MS, () => now, async ms => {
    waits.push(ms)
    now += ms
  })

  await throttle.waitForTurn()
  await throttle.waitForTurn()

  assert.deepEqual(waits, [CORK_DETAIL_REQUEST_DELAY_MS])
})

test("Retry-After accepts seconds and HTTP dates, rejecting invalid values", () => {
  assert.equal(retryAfterDelayMs("4"), 4_000)
  assert.equal(retryAfterDelayMs(" 2 "), 2_000)
  assert.equal(retryAfterDelayMs("not-a-delay"), null)
  assert.equal(retryAfterDelayMs(new Date(10_000).toUTCString(), 0), 10_000)
})

test("Cork 429 fallback uses bounded exponential backoff", () => {
  assert.deepEqual([1, 2, 3, 4, 5].map(attempt => corkRetryDelayMs(attempt, null)), [2_000, 4_000, 8_000, 16_000, 16_000])
  assert.equal(corkRetryDelayMs(1, "7"), 7_000)
})
