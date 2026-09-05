const BASE = "https://www.eplanning.ie/KildareCC"
const UA = "OpenList ePlan compatibility probe (+https://www.openlist.ie)"
function text(value) { return String(value || "").replace(/<[^>]+>/g, " ").replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/\s+/g, " ").trim() }
function attrs(tag) { return Object.fromEntries([...String(tag).matchAll(/([:\w-]+)\s*=\s*["']([^"']*)["']/g)].map((m) => [m[1], m[2]])) }
function refs(html) { return [...new Set([...html.matchAll(/AppFileRefDetails\/([^/"'?#]+)\/\d+/gi)].map((m) => decodeURIComponent(m[1])))] }

for (const path of ["SearchListing/RECEIVED", "SearchListing/DECIDED", "SearchListing/GRANTED"] ) {
  const response = await fetch(`${BASE}/${path}`, { headers: { "User-Agent": UA }, redirect: "follow" })
  const html = await response.text()
  const links = [...html.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)]
    .map((m) => ({ href: m[1], label: text(m[2]) }))
    .filter((x) => /search|list|received|week|date|page|application/i.test(`${x.href} ${x.label}`))
  const controls = [...html.matchAll(/<(?:input|select|option|button)\b[^>]*>/gi)].map((m) => ({ ...attrs(m[0]), tag: m[0].match(/^<(\w+)/)?.[1] })).filter((a) => a.name || a.id || a.value)
  console.log(JSON.stringify({ path, status: response.status, finalUrl: response.url, bytes: html.length, refs: refs(html).slice(0,50), refCount: refs(html).length, links: links.slice(0,120), controls: controls.slice(0,120), pageText: text(html).slice(0,1600) }))
}
