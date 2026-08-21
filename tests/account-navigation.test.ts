import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"
import { shouldShowMyViewings } from "@/lib/account-navigation"

async function source(path: string) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8")
}

test("hides My Viewings for an authenticated user with no saved viewings", () => {
  assert.equal(shouldShowMyViewings(true, false), false)
})

test("shows My Viewings for an authenticated user with an existing viewing in a realistic saved state", () => {
  const existingViewing = {
    id: "34e62fb2-f6a9-43cd-8f6d-7b46d6bf8a06",
    owner_user_id: "37eef69a-48f4-47e6-b4b0-1c8d07be2fcf",
    status: "completed",
    viewing_starts_at: "2026-08-18T14:00:00.000Z",
  }

  assert.equal(shouldShowMyViewings(true, Boolean(existingViewing.id)), true)
})

test("session navigation state checks the same viewing owner field as My Viewings", async () => {
  const [sessionRoute, myViewingsPage] = await Promise.all([
    source("app/api/auth/session/route.ts"),
    source("app/my-viewings/page.tsx"),
  ])

  assert.match(sessionRoute, /\.eq\("owner_user_id", user\.id\)/)
  assert.doesNotMatch(sessionRoute, /\.eq\("user_id", user\.id\)/)
  assert.match(myViewingsPage, /\.eq\("owner_user_id", currentUser\.id\)/)
})
