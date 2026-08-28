import test from "node:test"
import assert from "node:assert/strict"

process.env.NEXT_PUBLIC_SUPABASE_URL ||= "https://example.supabase.co"
process.env.SUPABASE_SERVICE_ROLE_KEY ||= "test-service-role-key"

const {
  parseRss,
  isRepublicOfIrelandStory,
  extractReadableArticleText,
  referenceCandidates,
  scoreMatch,
  storyKey,
  autoMatch,
} = await import("../scripts/discover-notable-planning-v2.mjs")

test("parses direct publisher RSS links", () => {
  const rows = parseRss(`<?xml version="1.0"?><rss><channel><item>
    <title><![CDATA[Danone granted permission to expand operations in Macroom]]></title>
    <link>https://www.irishexaminer.com/business/companies/arid-123.html</link>
    <description><![CDATA[Cork County Council approved the expansion.]]></description>
    <pubDate>Fri, 28 Aug 2026 06:00:00 GMT</pubDate>
    <source>Irish Examiner</source>
  </item></channel></rss>`, "bing")
  assert.equal(rows.length, 1)
  assert.match(rows[0].link, /irishexaminer/)
  assert.equal(rows[0].provider, "bing")
})

test("keeps Republic of Ireland stories and rejects explicit UK stories", () => {
  assert.equal(isRepublicOfIrelandStory({
    title: "Hotel approved in Drogheda town centre",
    description: "Louth County Council has granted permission",
    publisher: "Irish Independent",
  }), true)
  assert.equal(isRepublicOfIrelandStory({
    title: "Planning approved for industrial scheme in West Lothian",
    description: "Scottish development",
    publisher: "Insider Media Ltd",
  }), false)
})

test("extracts article-body planning references and addresses", () => {
  const html = `<html><head><script type="application/ld+json">{"@type":"NewsArticle","articleBody":"The applicant lodged planning application 26/44496 for Florence Buildings, Washington Street West, Cork."}</script></head><body><article><p>The proposed Boxd Coffee outlet includes signage and associated works.</p></article></body></html>`
  const text = extractReadableArticleText(html)
  assert.match(text, /26\/44496/)
  assert.match(text, /Washington Street West/)
  assert.deepEqual(referenceCandidates(text), ["26/44496"])
})

test("exact planning references remain decisive", () => {
  const story = { text: "Cork City application 26/44496 is for a coffee outlet." }
  const match = scoreMatch(story, {
    reference: "26/44496",
    applicant_name: "CC & H Imperial Ltd",
    local_authority: "Cork City Council",
    location: "Florence Buildings, 1A Washington Street West, Cork",
    proposal: "Coffee shop and signage",
  }, referenceCandidates(story.text))
  assert.equal(match.score, 1)
})

test("recall-oriented policy auto-matches moderate clear winners", () => {
  assert.equal(autoMatch({ score: 0.51 }, { score: 0.47 }), true)
  assert.equal(autoMatch({ score: 0.62 }, { score: 0.61 }), true)
  assert.equal(autoMatch({ score: 0.49 }, { score: 0.2 }), false)
  assert.equal(autoMatch({ score: 0.53 }, { score: 0.52 }), false)
})

test("story memory key is stable", () => {
  const story = { title: "Example", publisher: "Irish Examiner", publishedAt: "2026-08-28T00:00:00Z" }
  assert.equal(storyKey(story), storyKey({ ...story }))
})
