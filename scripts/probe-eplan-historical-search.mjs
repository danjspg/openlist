const BASE = "https://www.eplanning.ie/KildareCC"
const UA = "OpenList ePlan compatibility probe (+https://www.openlist.ie)"

function text(value) {
  return String(value || "").replace(/<[^>]+>/g, " ").replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/\s+/g, " ").trim()
}
function attrs(tag) {
  return Object.fromEntries([...String(tag).matchAll(/([:\w-]+)\s*=\s*["']([^"']*)["']/g)].map((m) => [m[1], m[2]]))
}

for (const path of ["SearchExact", "SearchGeneral", "SearchByDate", "SearchDate", "SearchAdvanced", "WeeklyLists", "SearchPlanning"] ) {
  const response = await fetch(`${BASE}/${path}`, { headers: { "User-Agent": UA }, redirect: "follow" })
  const html = await response.text()
  const links = [...html.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)]
    .map((m) => ({ href: m[1], label: text(m[2]) }))
    .filter((x) => /search|plan|list|application/i.test(`${x.href} ${x.label}`))
  const forms = [...html.matchAll(/<form\b[^>]*>[\s\S]*?<\/form>/gi)].map((m) => {
    const open = m[0].match(/<form\b[^>]*>/i)?.[0] || ""
    const inputs = [...m[0].matchAll(/<(?:input|select)\b[^>]*>/gi)].map((i) => attrs(i[0])).filter((a) => a.name || a.id)
    return { form: attrs(open), inputs }
  })
  console.log(JSON.stringify({ path, status: response.status, finalUrl: response.url, bytes: html.length, links: links.slice(0, 80), forms }))
}
