const BASE = "https://www.eplanning.ie/KildareCC"
const UA = "OpenList ePlan compatibility probe (+https://www.openlist.ie)"
function text(value) { return String(value || "").replace(/<[^>]+>/g, " ").replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/\s+/g, " ").trim() }
function refs(html) { return [...new Set([...html.matchAll(/AppFileRefDetails\/([^/"'?#]+)\/\d+/gi)].map((m) => decodeURIComponent(m[1])))] }
function cookiesFrom(headers) { const raw = typeof headers.getSetCookie === "function" ? headers.getSetCookie() : [headers.get("set-cookie")].filter(Boolean); return raw.map((v) => String(v).split(";")[0]).filter(Boolean) }

const landing = await fetch(`${BASE}/SearchExact`, { headers: { "User-Agent": UA } })
const html = await landing.text()
const tokens = [...html.matchAll(/name=["']__RequestVerificationToken["'][^>]*value=["']([^"']+)/gi)].map((m) => m[1])
const token = tokens.at(-1)
const cookie = cookiesFrom(landing.headers).join("; ")
if (!token) throw new Error("No detailed-search token")

for (const test of [
  { label: "blank", file: "", name: "", address: "", description: "" },
  { label: "space", file: " ", name: "", address: "", description: "" },
  { label: "wildcard", file: "%", name: "", address: "", description: "" },
  { label: "address-wildcard", file: "", name: "", address: "%", description: "" },
]) {
  const form = new URLSearchParams()
  for (const [name, value] of [
    ["__RequestVerificationToken", token], ["TxtFileNumber", test.file], ["TxtName", test.name],
    ["TxtAddress", test.address], ["TxtDevdescription", test.description],
    ["CheckBoxList[0].Id", "0"], ["CheckBoxList[0].Name", "Kildare County Council"],
    ["CheckBoxList[0].IsSelected", "true"], ["CheckBoxList[0].IsSelected", "false"],
    ["LstTimeLimit", "0"], ["SearchType", "Exact"], ["CountyTownCount", "1"],
    ["CountyTownCouncilNames", "Kildare County Council:0,"],
  ]) form.append(name, value)
  const response = await fetch(`${BASE}/searchresults`, { method: "POST", headers: { "User-Agent": UA, "Content-Type": "application/x-www-form-urlencoded", "Referer": `${BASE}/SearchExact`, Cookie: cookie }, body: form, redirect: "follow" })
  const result = await response.text()
  const found = refs(result)
  const links = [...result.matchAll(/href=["']([^"']+)["']/gi)].map((m) => m[1]).filter((href) => /searchresults|AppFileRefDetails|page/i.test(href)).slice(0,80)
  console.log(JSON.stringify({ ...test, status: response.status, finalUrl: response.url, bytes: result.length, refCount: found.length, refs: found.slice(0,30), links, pageText: text(result).slice(-1200) }))
}
