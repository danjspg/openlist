import type { Metadata, Viewport } from "next"
import { Analytics } from "@vercel/analytics/next"
import { SpeedInsights } from "@vercel/speed-insights/next"
import Image from "next/image"
import Link from "next/link"
import AccountFooterLink from "@/components/AccountFooterLink"
import AuthStateProvider from "@/components/AuthStateProvider"
import Nav from "@/components/Nav"
import "leaflet/dist/leaflet.css"
import "./globals.css"

export const metadata: Metadata = {
  title: "OpenList | Property Intelligence for Ireland",
  description:
    "Search Irish sold prices and planning applications. Research properties, neighbourhoods and development activity in one place.",
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL || "https://www.openlist.ie"
  ),
  icons: {
    icon: [
      { url: "/favicon-v2.ico?v=2", sizes: "16x16 32x32", type: "image/x-icon" },
    ],
    shortcut: "/favicon-v2.ico?v=2",
    apple: [
      { url: "/apple-icon-v2.png?v=2", sizes: "180x180", type: "image/png" },
    ],
  },
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className="overflow-x-hidden">
      <body className="overflow-x-hidden bg-stone-50 text-stone-900">
        <AuthStateProvider>
          <header className="sticky top-0 z-50 border-b border-stone-200/80 bg-white/90 backdrop-blur-md">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <div className="flex flex-wrap items-center justify-between gap-x-4 py-3 sm:py-4 md:flex-nowrap md:py-4">
              <Link href="/" className="flex shrink-0 items-center">
                <Image
                  src="/logo-small.png"
                  alt="OpenList"
                  width={180}
                  height={180}
                  className="h-[45px] w-[45px] sm:hidden"
                  priority
                />

                <Image
                  src="/logo-v2.png"
                  alt="OpenList"
                  width={450}
                  height={131}
                  className="hidden h-auto w-56 sm:block md:w-60 lg:w-64"
                  priority
                />
              </Link>

              <Nav />
            </div>
          </div>
          </header>

          {children}

          <footer className="mt-16 border-t border-stone-200 bg-white">
          <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
            <div className="grid gap-10 md:grid-cols-2">
              <div>
                <div className="flex items-center">
                  <Image
                    src="/logo-v2.png"
                    alt="OpenList"
                    width={450}
                    height={131}
                    className="h-auto w-40"
                  />
                </div>

                <p className="mt-4 max-w-md text-sm leading-6 text-stone-600">
                  OpenList makes Irish property data easier to understand by connecting sold prices, planning applications and location context.
                </p>

                <div className="mt-6 space-y-3 text-xs leading-5 text-stone-500">
                  <p>
                    Information is provided for general purposes only and may not always reflect the latest official record. OpenList is not an estate agent, auctioneer, valuer, broker or legal adviser.
                  </p>
                </div>
              </div>

              <div className="grid gap-6 text-sm text-stone-600 sm:grid-cols-3 md:pt-12">
                <FooterLinkGroup title="Property intelligence">
                  <Link href="/sold-prices" className="transition hover:text-stone-900">
                    Sold prices
                  </Link>
                  <Link href="/planning" className="transition hover:text-stone-900">
                    Planning
                  </Link>
                </FooterLinkGroup>

                <FooterLinkGroup title="Account tools">
                  <AccountFooterLink />
                </FooterLinkGroup>

                <FooterLinkGroup title="Company">
                  <Link href="/about" className="transition hover:text-stone-900">
                    About OpenList
                  </Link>
                  <Link href="/about#data-methodology" className="transition hover:text-stone-900">
                    Data methodology
                  </Link>
                  <Link href="/terms" className="transition hover:text-stone-900">
                    Terms
                  </Link>
                  <Link href="/privacy" className="transition hover:text-stone-900">
                    Privacy
                  </Link>
                  <Link href="/admin/access" className="text-stone-400 transition hover:text-stone-700">
                    Admin
                  </Link>
                </FooterLinkGroup>
              </div>
            </div>

            <div className="mt-10 border-t border-stone-200 pt-6 text-xs text-stone-400">
              © {new Date().getFullYear()} OpenList. All rights reserved.
            </div>
          </div>
          </footer>
        </AuthStateProvider>
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  )
}

function FooterLinkGroup({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <div>
      <h2 className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-400">
        {title}
      </h2>
      <div className="mt-3 flex flex-col gap-3">{children}</div>
    </div>
  )
}
