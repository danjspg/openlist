const BASE = "https://www.eplanning.ie/KildareCC"
const UA = "OpenList ePlan compatibility probe (+https://www.openlist.ie)"
function text(value) { return String(value || "").replace(/<br\s*\/?\s*>/gi, " | ").replace(/<[^>]+>/g, " ").replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/&#39;/g, "'").replace(/&quot;/gi, '"').replace(/\s+/g, " ").trim() }
function cookiesFrom(headers) { const raw = typeof headers.getSetCookie === "function" ? headers.getSetCookie() : [headers.get("set-cookie")].filter(Boolean); return raw.map((v) => String(v).split(";")[0]).filter(Boolean) }
function rows(html) { return [...html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].map((m) => [...m[1].matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((c) => text(c[1]))).filter((r) => r.length > 1) }
const landing = await fetch(`${BASE}/SearchExact`, { headers:{"User-Agent":UA} })
const html = await landing.text()
const tokens=[...html.matchAll(/name=["']__RequestVerificationToken["'][^>]*value=["']([^"']+)/gi)].map((m)=>m[1])
const cookie=cookiesFrom(landing.headers).join("; ")
const form=new URLSearchParams()
for(const [name,value] of [["__RequestVerificationToken",tokens.at(-1)],["TxtFileNumber",""],["TxtName",""],["TxtAddress",""],["TxtDevdescription",""],["CheckBoxList[0].Id","0"],["CheckBoxList[0].Name","Kildare County Council"],["CheckBoxList[0].IsSelected","true"],["CheckBoxList[0].IsSelected","false"],["LstTimeLimit","0"],["SearchType","Exact"],["CountyTownCount","1"],["CountyTownCouncilNames","Kildare County Council:0,"]]) form.append(name,value)
const response=await fetch(`${BASE}/searchresults`,{method:"POST",headers:{"User-Agent":UA,"Content-Type":"application/x-www-form-urlencoded",Referer:`${BASE}/SearchExact`,Cookie:cookie},body:form})
const result=await response.text()
console.log(JSON.stringify({status:response.status,bytes:result.length,rows:rows(result).slice(0,15),tail:text(result).slice(-500)}))
