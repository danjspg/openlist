const BASE = "https://www.eplanning.ie/KildareCC"
const UA = "OpenList ePlan compatibility probe (+https://www.openlist.ie)"

function text(value) {
  return String(value || "").replace(/<[^>]+>/g, " ").replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/\s+/g, " ").trim()
}
function refs(html) {
  return [...html.matchAll(/AppFileRefDetails\/([^/"'?#]+)\/\d+/gi)].map((m) => decodeURIComponent(m[1]))
}
function cookiesFrom(headers) {
  const raw = typeof headers.getSetCookie === "function" ? headers.getSetCookie() : [headers.get("set-cookie")].filter(Boolean)
  return raw.map((value) => String(value).split(";")[0]).filter(Boolean)
}

const landing = await fetch(`${BASE}/SearchExact`, { headers: { "User-Agent": UA } })
const html = await landing.text()
const tokens = [...html.matchAll(/name=["']__RequestVerificationToken["'][^>]*value=["']([^"']+)/gi)].map((m) => m[1])
const token = tokens.at(-1)
const cookies = cookiesFrom(landing.headers)
const cookie = cookies.join("; ")
if (!token) throw new Error("No verification token")
console.log("landing", landing.status, "cookies", cookies.map((item) => item.split("=")[0]), "tokens", tokens.length, "bytes", html.length)

for (const query of ["12", "120", "13", "16"]) {
  const form = new URLSearchParams()
  for (const [name, value] of [
    ["__RequestVerificationToken", token],
    ["TxtFileNumber", query], ["TxtName", ""], ["TxtAddress", ""], ["TxtDevdescription", ""],
    ["CheckBoxList[0].Id", "0"], ["CheckBoxList[0].Name", "Kildare County Council"],
    ["CheckBoxList[0].IsSelected", "true"], ["CheckBoxList[0].IsSelected", "false"],
    ["LstTimeLimit", "0"], ["SearchType", "Exact"], ["CountyTownCount", "1"],
    ["CountyTownCouncilNames", "Kildare County Council:0,"],
  ]) form.append(name, value)
  const response = await fetch(`${BASE}/searchresults`, {
    method: "POST",
    headers: {
      "User-Agent": UA,
      "Content-Type": "application/x-www-form-urlencoded",
      "Referer": `${BASE}/SearchExact`,
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: form,
    redirect: "follow",
  })
  const result = await response.text()
  const found = [...new Set(refs(result))]
  const pages = [...result.matchAll(/Page\s+(\d+)\s+of\s+(\d+)/gi)].map((m) => Number(m[2]))
  const pagerLinks = [...result.matchAll(/href=["']([^"']*(?:page|Page|SearchResults)[^"']*)["']/g)].map((m) => m[1]).slice(0, 20)
  console.log(JSON.stringify({ query, status: response.status, finalUrl: response.url, bytes: result.length, refs: found.slice(0, 25), refCountOnPage: found.length, maxPages: pages.length ? Math.max(...pages) : null, pagerLinks, bodyPreview: text(result).slice(0, 600) }))
}
