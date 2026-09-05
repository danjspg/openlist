const UA = "OpenList ePlan compatibility probe (+https://www.openlist.ie)"
const urls = [
  "https://eplanning.ie/eplan/searchexact?localAuthorityId=13",
  "https://www.eplanning.ie/eplan/searchexact?localAuthorityId=13",
]
function text(value){return String(value||"").replace(/<[^>]+>/g," ").replace(/&nbsp;/gi," ").replace(/&amp;/gi,"&").replace(/\s+/g," ").trim()}
function attrs(tag){return Object.fromEntries([...String(tag).matchAll(/([:\w-]+)\s*=\s*["']([^"']*)["']/g)].map(m=>[m[1],m[2]]))}
for(const url of urls){
  try{
    const response=await fetch(url,{headers:{"User-Agent":UA},redirect:"follow",signal:AbortSignal.timeout(30000)})
    const html=await response.text()
    const forms=[...html.matchAll(/<form\b[^>]*>[\s\S]*?<\/form>/gi)].map(m=>({form:attrs(m[0].match(/<form\b[^>]*>/i)?.[0]||""),controls:[...m[0].matchAll(/<(?:input|select|button)\b[^>]*>/gi)].map(x=>attrs(x[0])).filter(a=>a.name||a.id)}))
    const scripts=[...html.matchAll(/<script\b[^>]*src=["']([^"']+)["']/gi)].map(m=>m[1])
    const links=[...html.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)].map(m=>({href:m[1],label:text(m[2])})).filter(x=>/search|plan|list/i.test(`${x.href} ${x.label}`))
    console.log(JSON.stringify({url,status:response.status,finalUrl:response.url,bytes:html.length,forms,scripts,links:links.slice(0,80),preview:text(html).slice(0,1200)}))
  }catch(error){console.log(JSON.stringify({url,error:String(error)}))}
}
