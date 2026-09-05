const urls = [
  "https://www.eplanning.ie/KildareCC/SearchExact",
  "https://www.eplanning.ie/KildareCC/PlanningLists",
  "https://www.eplanning.ie/KildareCC/SearchListing",
  "https://www.eplanning.ie/KildareCC/SearchResults",
]

function attrs(tag) {
  return Object.fromEntries([...tag.matchAll(/([:\w-]+)\s*=\s*["']([^"']*)["']/g)].map((m) => [m[1], m[2]]))
}

for (const url of urls) {
  try {
    const response = await fetch(url, { headers: { "User-Agent": "OpenList ePlan compatibility probe (+https://www.openlist.ie)" }, redirect: "follow" })
    const html = await response.text()
    console.log("\nURL", url, "STATUS", response.status, "FINAL", response.url, "BYTES", html.length)
    for (const match of html.matchAll(/<form\b[^>]*>/gi)) console.log("FORM", attrs(match[0]))
    for (const match of html.matchAll(/<input\b[^>]*>/gi)) {
      const a = attrs(match[0]); if (a.name || a.id) console.log("INPUT", a)
    }
    for (const match of html.matchAll(/<select\b[^>]*>[\s\S]*?<\/select>/gi)) {
      const open = match[0].match(/<select\b[^>]*>/i)?.[0] || ""
      const a = attrs(open)
      const options = [...match[0].matchAll(/<option\b([^>]*)>([\s\S]*?)<\/option>/gi)].map((m) => ({ ...attrs(m[1]), text: m[2].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim() }))
      console.log("SELECT", a, options)
    }
  } catch (error) {
    console.log("ERROR", url, String(error))
  }
}
