const BASE = "https://eplanning.ie/eplan"
const LA = "13"
const UA = "OpenList ePlan compatibility probe (+https://www.openlist.ie)"
function text(value){return String(value||"").replace(/<br\s*\/?\s*>/gi," | ").replace(/<[^>]+>/g," ").replace(/&nbsp;/gi," ").replace(/&amp;/gi,"&").replace(/&#39;/gi,"'").replace(/\s+/g," ").trim()}
function cookiesFrom(headers){const raw=typeof headers.getSetCookie==="function"?headers.getSetCookie():[headers.get("set-cookie")].filter(Boolean);return raw.map(v=>String(v).split(";")[0]).filter(Boolean)}
function mergeCookies(...sets){const jar=new Map();for(const item of sets.flat()){const [name]=String(item).split("=");if(name)jar.set(name,item)}return [...jar.values()].join("; ")}
function rows(html){return [...String(html).matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].map(m=>[...m[1].matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)].map(c=>text(c[1]))).filter(r=>r.length>1)}
async function timedFetch(url,options={}){const started=Date.now();const response=await fetch(url,{...options,signal:AbortSignal.timeout(45000)});const html=await response.text();return{response,html,ms:Date.now()-started}}
const landing=await timedFetch(`${BASE}/searchexact?localAuthorityId=${LA}`,{headers:{"User-Agent":UA}})
const tokens=[...landing.html.matchAll(/name=["']__RequestVerificationToken["'][^>]*value=["']([^"']+)/gi)].map(m=>m[1])
let cookie=mergeCookies(cookiesFrom(landing.response.headers))
const form=new URLSearchParams()
for(const [name,value] of [["__RequestVerificationToken",tokens.at(-1)],["TxtFileNumber",""],["TxtName",""],["TxtAddress",""],["TxtDevdescription",""],["CheckBoxList[0].Id",LA],["CheckBoxList[0].Name","Kildare County Council"],["CheckBoxList[0].IsSelected","True"],["LstTimeLimit","0"],["SearchType","Exact"],["CountyTownCount","1"],["CountyTownCouncilNames",`Kildare County Council:${LA},`]])form.append(name,value)
const initial=await timedFetch(`${BASE}/searchresults?localAuthorityId=${LA}`,{method:"POST",headers:{"User-Agent":UA,"Content-Type":"application/x-www-form-urlencoded",Referer:`${BASE}/searchexact?localAuthorityId=${LA}`,Cookie:cookie},body:form})
cookie=mergeCookies(cookie.split("; ").filter(Boolean),cookiesFrom(initial.response.headers))
const links=[...initial.html.matchAll(/href=["']([^"']+)["']/gi)].map(m=>m[1]).filter(h=>/searchresults/i.test(h)).slice(-30)
const output={landingMs:landing.ms,initial:{status:initial.response.status,ms:initial.ms,page:text(initial.html).match(/Page\s+\d+\s+of\s+\d+(?:\s+\(\d+ Applications\))?/i)?.[0]||null,rows:rows(initial.html).slice(0,12),links},pages:[]}
for(const page of [2,100,1000]){
  for(const url of [`${BASE}/searchresults/Default/${page}?localAuthorityId=${LA}`,`${BASE}/searchresults/Default/${page}`]){
    try{const result=await timedFetch(url,{headers:{"User-Agent":UA,Referer:`${BASE}/searchresults?localAuthorityId=${LA}`,Cookie:cookie}});output.pages.push({page,url,status:result.response.status,ms:result.ms,pageText:text(result.html).match(/Page\s+\d+\s+of\s+\d+(?:\s+\(\d+ Applications\))?/i)?.[0]||null,rows:rows(result.html).slice(0,3)})}catch(error){output.pages.push({page,url,error:String(error?.name||error)})}
  }
}
console.log(JSON.stringify(output))
