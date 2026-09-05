const BASE = "https://www.eplanning.ie/KildareCC"
const UA = "OpenList ePlan compatibility probe (+https://www.openlist.ie)"
const TIMEOUT_MS = 25000
function cookiesFrom(headers) { const raw = typeof headers.getSetCookie === "function" ? headers.getSetCookie() : [headers.get("set-cookie")].filter(Boolean); return raw.map((v) => String(v).split(";")[0]).filter(Boolean) }
function refs(html) { return [...new Set([...html.matchAll(/AppFileRefDetails\/([^/"'?#]+)\/\d+/gi)].map((m) => decodeURIComponent(m[1])))] }
const landing = await fetch(`${BASE}/SearchExact`, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(TIMEOUT_MS) })
const html = await landing.text()
const tokens = [...html.matchAll(/name=["']__RequestVerificationToken["'][^>]*value=["']([^"']+)/gi)].map((m) => m[1])
const cookie = cookiesFrom(landing.headers).join("; ")
if (!tokens.length) throw new Error("No verification token")
const output=[]
for (const query of ["12","13","14","15","16"]) {
  const form = new URLSearchParams()
  for (const [name,value] of [["__RequestVerificationToken",tokens.at(-1)],["TxtFileNumber",query],["TxtName",""],["TxtAddress",""],["TxtDevdescription",""],["CheckBoxList[0].Id","0"],["CheckBoxList[0].Name","Kildare County Council"],["CheckBoxList[0].IsSelected","true"],["CheckBoxList[0].IsSelected","false"],["LstTimeLimit","0"],["SearchType","Exact"],["CountyTownCount","1"],["CountyTownCouncilNames","Kildare County Council:0,"]]) form.append(name,value)
  try {
    const response=await fetch(`${BASE}/searchresults`,{method:"POST",headers:{"User-Agent":UA,"Content-Type":"application/x-www-form-urlencoded",Referer:`${BASE}/SearchExact`,Cookie:cookie},body:form,signal:AbortSignal.timeout(TIMEOUT_MS)})
    const result=await response.text()
    const found=refs(result)
    const page=result.match(/Page\s+(\d+)\s+of\s+(\d+)\s+\((\d+) Applications\)/i)
    output.push({query,status:response.status,page:page?{current:Number(page[1]),pages:Number(page[2]),applications:Number(page[3])}:null,refs:found.slice(0,20),refCountOnPage:found.length})
  } catch(error) { output.push({query,error:String(error?.name||error)}) }
}
console.log(JSON.stringify(output))
