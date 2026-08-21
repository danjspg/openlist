import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

test("metrics dashboard includes product growth and keeps technical detail collapsible", async () => {
  const dashboard = await readFile(
    new URL("../scripts/report-openlist-dashboard.mts", import.meta.url),
    "utf8"
  )

  assert.match(dashboard, /supabase\.auth\.admin\.listUsers/)
  assert.match(dashboard, /planning_alert_subscriptions/)
  assert.match(dashboard, /Registered users/)
  assert.match(dashboard, /Planning alerts set/)
  assert.match(dashboard, /Active planning alerts/)
  assert.match(dashboard, /Last 24h/)
  assert.match(dashboard, /Last 7d/)
  assert.match(dashboard, /<summary>Full technical report<\/summary>/)
})

test("planning measurement workflow publishes the readable dashboard to issue 10", async () => {
  const workflow = await readFile(
    new URL("../.github/workflows/planning-seo.yml", import.meta.url),
    "utf8"
  )

  assert.match(workflow, /report-openlist-dashboard\.mts --report planning-seo-report\.txt/)
  assert.match(workflow, /cat openlist-dashboard\.md >> "\$GITHUB_STEP_SUMMARY"/)
  assert.match(workflow, /gh issue edit 10/)
  assert.match(workflow, /cat openlist-dashboard\.md/)
  assert.doesNotMatch(workflow, /echo '```text'[\s\S]*cat planning-seo-report\.txt/)
})
