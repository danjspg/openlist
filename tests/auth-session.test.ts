import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

async function source(path: string) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8")
}

test("auth sessions keep refresh credentials for ninety days and refresh expired access tokens", async () => {
  const auth = await source("lib/auth.ts")

  assert.match(auth, /SESSION_COOKIE_MAX_AGE = 60 \* 60 \* 24 \* 90/)
  assert.match(auth, /const refreshToken = cookieStore\.get\(REFRESH_TOKEN_COOKIE\)\?\.value/)
  assert.match(auth, /auth\.refreshSession\(\{ refresh_token: refreshToken \}\)/)
  assert.match(auth, /await persistRefreshedSession\(data\.session\)/)
  assert.match(auth, /response\.cookies\.set\(ACCESS_TOKEN_COOKIE, session\.access_token, options\)/)
  assert.match(auth, /response\.cookies\.set\(REFRESH_TOKEN_COOKIE, session\.refresh_token, options\)/)
  assert.doesNotMatch(auth, /expires_at - Math\.floor\(Date\.now\(\) \/ 1000\)/)
})

test("auth refresh remains safe in read-only Server Component renders", async () => {
  const auth = await source("lib/auth.ts")

  assert.match(auth, /try \{[\s\S]*cookieStore\.set\(ACCESS_TOKEN_COOKIE[\s\S]*cookieStore\.set\(REFRESH_TOKEN_COOKIE[\s\S]*\} catch \{/)
  assert.match(auth, /Server Components can read cookies but cannot mutate them/)
})
