import { NextResponse, type NextRequest } from "next/server"
import { getPprMarket } from "@/lib/ppr-markets"
import { getShortTownRedirect } from "@/lib/ppr-sold-price-routes"

const PUBLIC_SOLD_PRICE_SINGLE_SEGMENT_ROUTES = new Set([
  "tracked-markets",
  "counties-compared",
  "dublin-compared",
  "cork-compared",
  "limerick-compared",
  "galway-compared",
  "waterford-compared",
  "commuter-towns",
  "affordable-markets",
  "high-value-markets",
  "most-active-markets",
  "least-active-markets",
  "hottest-markets",
  "coolest-markets",
  "rising-markets",
  "falling-markets",
  "search",
])

function soldPricesNotFoundResponse() {
  return new NextResponse(
    `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="robots" content="noindex, follow" />
    <title>Sold-prices page not found | OpenList</title>
    <style>
      body{margin:0;background:#fafaf9;color:#1c1917;font-family:ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
      main{min-height:100vh;display:flex;align-items:center;justify-content:center;padding:48px 16px}
      section{max-width:720px;width:100%;background:white;border:1px solid #e7e5e4;border-radius:28px;padding:40px;box-shadow:0 1px 2px rgba(28,25,23,.06)}
      p.eyebrow{margin:0;color:#78716c;font-size:13px;font-weight:600;letter-spacing:.2em;text-transform:uppercase}
      h1{margin:12px 0 0;font-size:clamp(2rem,5vw,3rem);line-height:1.05;letter-spacing:-.02em}
      p.copy{margin:18px 0 0;color:#57534e;line-height:1.7}
      nav{display:flex;flex-wrap:wrap;gap:12px;margin-top:26px}
      a{display:inline-flex;border-radius:999px;padding:10px 18px;font-size:14px;font-weight:600;text-decoration:none}
      a.primary{background:#1c1917;color:white}
      a.secondary{border:1px solid #d6d3d1;color:#44403c}
    </style>
  </head>
  <body>
    <main>
      <section>
        <p class="eyebrow">Sold prices</p>
        <h1>We could not find that sold-prices page.</h1>
        <p class="copy">Use the sold-prices hub to browse county pages, tracked market reports and reliable local area pages.</p>
        <nav>
          <a class="primary" href="/sold-prices">Open sold prices</a>
          <a class="secondary" href="/sold-prices/counties-compared">Compare counties</a>
        </nav>
      </section>
    </main>
  </body>
</html>`,
    {
      status: 404,
      headers: {
        "content-type": "text/html; charset=utf-8",
        "x-robots-tag": "noindex, follow",
      },
    }
  )
}

export function middleware(request: NextRequest) {
  const match = request.nextUrl.pathname.match(/^\/sold-prices\/([^/]+)$/)
  if (!match) return NextResponse.next()

  const slug = match[1]
  const redirectPath = getShortTownRedirect(slug)
  if (!redirectPath) {
    const market = getPprMarket(slug)
    if (!market && !PUBLIC_SOLD_PRICE_SINGLE_SEGMENT_ROUTES.has(slug)) {
      return soldPricesNotFoundResponse()
    }
    if (market?.marketType !== "town_suburb") return NextResponse.next()

    return soldPricesNotFoundResponse()
  }

  const url = request.nextUrl.clone()
  url.pathname = redirectPath
  return NextResponse.redirect(url, 308)
}

export const config = {
  matcher: "/sold-prices/:path*",
}
