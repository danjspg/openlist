import { NextResponse, type NextRequest } from "next/server"
import { getLegacyShortTownRedirect } from "@/lib/ppr-legacy-town-routes"
import { getPprMarket } from "@/lib/ppr-markets"

export function middleware(request: NextRequest) {
  const match = request.nextUrl.pathname.match(/^\/sold-prices\/([^/]+)$/)
  if (!match) return NextResponse.next()

  const slug = match[1]
  const redirectPath = getLegacyShortTownRedirect(slug)
  if (redirectPath) {
    const url = request.nextUrl.clone()
    url.pathname = redirectPath
    return NextResponse.redirect(url, 308)
  }

  const market = getPprMarket(slug)
  if (market?.marketType !== "town_suburb") {
    return NextResponse.next()
  }

  return new NextResponse(null, { status: 404 })
}

export const config = {
  matcher: "/sold-prices/:path*",
}
