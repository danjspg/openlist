import assert from "node:assert/strict"
import test from "node:test"
import { readFile } from "node:fs/promises"

async function source(path: string) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8")
}

test("privacy notice has public metadata and the required privacy contact", async () => {
  const page = await source("app/privacy/page.tsx")
  assert.match(page, /title: "Privacy Notice \| OpenList"/)
  assert.match(page, /canonical: "\/privacy"/)
  assert.match(page, /Last updated: 21 August 2026/)
  assert.match(page, /privacy@openlist\.ie/)
  assert.match(page, /Article 6\(1\)\(f\) GDPR/)
})

test("privacy is linked from the footer and email collection flows", async () => {
  const [layout, auth, newViewing, editViewing] = await Promise.all([
    source("app/layout.tsx"),
    source("components/AuthEmailForm.tsx"),
    source("app/my-viewings/new/page.tsx"),
    source("app/my-viewings/[id]/edit/page.tsx"),
  ])

  assert.match(layout, /href="\/privacy"/)
  assert.match(auth, /PrivacyReference/)
  assert.match(newViewing, /PrivacyReference/)
  assert.match(editViewing, /PrivacyReference/)
})

test("privacy files do not introduce a personal email address", async () => {
  const [page, assessment] = await Promise.all([
    source("app/privacy/page.tsx"),
    source("docs/privacy-legitimate-interests-assessment.md"),
  ])
  const emails = `${page}\n${assessment}`.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || []
  assert.deepEqual([...new Set(emails.map((email) => email.toLowerCase()))], ["privacy@openlist.ie"])
})

test("privacy covers requested planning updates without marketing consent", async () => {
  const page = await source("app/privacy/page.tsx")
  assert.match(page, /saved planning subscriptions/)
  assert.match(page, /planning update emails you request/)
  assert.match(page, /planning-update and viewing-related transactional emails/)
  assert.match(page, /signed unsubscribe link in a planning update email, without signing in/)
  assert.match(page, /does not use open or click tracking in planning update emails/)
  assert.match(page, /not permission for unrelated marketing/)
})
