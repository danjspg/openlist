const BASE = "https://www.eplanning.ie/KildareCC"
const UA = "OpenList ePlan compatibility probe (+https://www.openlist.ie)"
function text(value) { return String(value || "").replace(/<br\s*\/?\s*>/gi, " | ").replace(/<[^>]+>/g, " ").replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/&#39;/g, "'").replace(/\s+/g, " ").trim() }
function cookiesFrom(headers) { const raw = typeof headers.getSetCookie === "function" ? headers.getSetCookie() : [headers.get("set-cookie")].filter(Boolean); return raw.map((v) => String(v).split(";")[0]).filter(Boolean) }
function rows(html) { return [...html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].map((m) => [...m[1].matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((c) => text(c[1]))).filter((r) => r.length > 1) }
async function fetchText(url, options={}) { const r=await fetch(url,options); return { response:r, html:await r.text() } }

const landing = await fetchText(`${BASE}/SearchExact`, { headers: { "User-Agent": UA } })
const tokens = [...landing.html.matchAll(/name=["']__RequestVerificationToken["'][^>]*value=["']([^"']+)/gi)].map((m) => m[1])
const cookie = cookiesFrom(landing.response.headers).join("; ")
const form = new URLSearchParams()
for (const [name,value] of [["__RequestVerificationToken",tokens.at(-1)],["TxtFileNumber",""],["TxtName",""],["TxtAddress",""],["TxtDevdescription",""],["CheckBoxList[0].Id","0"],["CheckBoxList[0].Name","Kildare County Council"],["CheckBoxList[0].IsSelected","true"],["CheckBoxList[0].IsSelected","false"],["LstTimeLimit","0"],["SearchType","Exact"],["CountyTownCount","1"],["CountyTownCouncilNames","Kildare County Council:0,"]]) form.append(name,value)
const initial = await fetchText(`${BASE}/searchresults`, { method:"POST", headers:{"User-Agent":UA,"Content-Type":"application/x-www-form-urlencoded","Referer":`${BASE}/SearchExact`,Cookie:cookie}, body:form })
console.log("INITIAL", JSON.stringify(rows(initial.html).slice(0,15)))

for (const path of ["searchresults/recvdate", "searchresults/recvdate", "searchresults/Default/1", "searchresults/Default/5000", "searchresults/Default/10000"]) {
  const result = await fetchText(`${BASE}/${path}`, { headers:{"User-Agent":UA,Cookie:cookie,"Referer":`${BASE}/searchresults`} })
  const page = text(result.html).match(/Page\s+(\d+)\s+of\s+(\d+)\s+\((\d+) Applications\)/i)
  console.log(path, JSON.stringify({status:result.response.status,page:page?.slice(1),rows:rows(result.html).slice(0,15)}))
}
