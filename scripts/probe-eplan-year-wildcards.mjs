const BASE = "https://www.eplanning.ie/KildareCC"
const UA = "OpenList ePlan compatibility probe (+https://www.openlist.ie)"
const TIMEOUT_MS = 30000

function text(value) { return String(value || "").replace(/<br\s*\/?\s*>/gi," | ").replace(/<[^>]+>/g," ").replace(/&nbsp;/gi," ").replace(/&amp;/gi,"&").replace(/\s+/g," ").trim() }
function cookiesFrom(headers) { const raw = typeof headers.getSetCookie === "function" ? headers.getSetCookie() : [headers.get("set-cookie")].filter(Boolean); return raw.map((v)=>String(v).split(";")[0]).filter(Boolean) }
function refs(html) { return [...new Set([...String(html).matchAll(/AppFileRefDetails\/([^/"'?#]+)\/\d+/gi)].map((m)=>decodeURIComponent(m[1])))] }
async function query(file) {
  const landing = await fetch(`${BASE}/SearchExact`, { headers:{"User-Agent":UA}, signal:AbortSignal.timeout(TIMEOUT_MS) })
  const html = await landing.text()
  const tokens=[...html.matchAll(/name=["']__RequestVerificationToken["'][^>]*value=["']([^"']+)/gi)].map((m)=>m[1])
  const cookie=cookiesFrom(landing.headers).join("; ")
  const form=new URLSearchParams()
  for(const [name,value] of [["__RequestVerificationToken",tokens.at(-1)],["TxtFileNumber",file],["TxtName",""],["TxtAddress",""],["TxtDevdescription",""],["CheckBoxList[0].Id","0"],["CheckBoxList[0].Name","Kildare County Council"],["CheckBoxList[0].IsSelected","true"],["CheckBoxList[0].IsSelected","false"],["LstTimeLimit","0"],["SearchType","Exact"],["CountyTownCount","1"],["CountyTownCouncilNames","Kildare County Council:0,"]]) form.append(name,value)
  const response=await fetch(`${BASE}/searchresults`,{method:"POST",headers:{"User-Agent":UA,"Content-Type":"application/x-www-form-urlencoded",Referer:`${BASE}/SearchExact`,Cookie:cookie},body:form,signal:AbortSignal.timeout(TIMEOUT_MS)})
  const result=await response.text()
  const page=text(result).match(/Page\s+(\d+)\s+of\s+(\d+)\s+\((\d+) Applications\)/i)
  return {file,status:response.status,refs:refs(result).slice(0,20),countOnPage:refs(result).length,page:page?.slice(1)||null,bytes:result.length}
}

for (const file of ["12%","12*","12_","12?","%12%","2012%"] ) {
  try { console.log(JSON.stringify(await query(file))) }
  catch(error) { console.log(JSON.stringify({file,error:String(error?.name||error)})) }
}
