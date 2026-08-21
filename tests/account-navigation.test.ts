import assert from "node:assert/strict"
import test from "node:test"
import { shouldShowMyViewings } from "@/lib/account-navigation"

test("hides My Viewings for an authenticated user with no saved viewings", () => {
  assert.equal(shouldShowMyViewings(true, false), false)
})

test("shows My Viewings for an authenticated user with saved viewings", () => {
  assert.equal(shouldShowMyViewings(true, true), true)
})
