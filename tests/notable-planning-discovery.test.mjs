import test from "node:test"
import assert from "node:assert/strict"

process.env.NEXT_PUBLIC_SUPABASE_URL ||= "https://example.supabase.co"
process.env.SUPABASE_SERVICE_ROLE_KEY ||= "test-service-role-key"

const {
  aliasesForStory,
  displayNameCandidate,
  parseRss,
  referenceCandidates,
  scoreMatch,
  searchPhrases,
} = await import("../scripts/discover-notable-planning.mjs")

test("parses Google News style RSS items", () => {
  const rows = parseRss(`<?xml version="1.0"?><rss><channel><item>
    <title><![CDATA[Boxd Coffee seeks permission on Washington Street - Irish Examiner]]></title>
    <link>https://news.google.com/example</link>
    <description><![CDATA[Plans concern Florence Buildings, Washington Street West.]]></description>
    <pubDate>Fri, 28 Aug 2026 06:00:00 GMT</pubDate>
    <source url="https://www.irishexaminer.com">Irish Examiner</source>
  </item></channel></rss>`)
  assert.equal(rows.length, 1)
  assert.match(rows[0].title, /Boxd Coffee/)
  assert.equal(rows[0].publisher, "Irish Examiner")
})

test("extracts common-name aliases from a press story", () => {
  const story = {
    title: "Boxd Coffee seeks permission on Washington Street",
    text: "Boxd Coffee seeks permission for Florence Buildings on Washington Street West in Cork.",
  }
  assert.equal(displayNameCandidate(story), "Boxd Coffee")
  assert.ok(aliasesForStory(story, "Boxd Coffee").some((alias) => alias.includes("Boxd Coffee")))
  assert.ok(searchPhrases(story).some((phrase) => phrase.includes("Washington Street")))
})

test("exact planning references are treated as strongest evidence", () => {
  const story = { text: "Cork City planning application 26/44496 concerns a coffee shop." }
  const refs = referenceCandidates(story.text)
  const match = scoreMatch(story, {
    reference: "26/44496",
    applicant_name: "CC & H Imperial Ltd",
    location: "Florence Buildings, 1A Washington Street West",
    proposal: "Permission for development",
  }, refs)
  assert.equal(match.score, 1)
  assert.equal(match.reason, "exact planning reference")
})

test("strong shared location text can produce a high-confidence match", () => {
  const story = {
    text: "A proposal at Florence Buildings 1A Washington Street West will provide a Boxd Coffee shop and signage.",
  }
  const match = scoreMatch(story, {
    reference: "26/44496",
    applicant_name: "CC & H Imperial Ltd",
    location: "Florence Buildings, 1A Washington Street West, Cork",
    proposal: "Permission for a coffee shop, signage and associated works at Florence Buildings",
  }, [])
  assert.ok(match.score >= 0.78)
})
