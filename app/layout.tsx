import type { Metadata, Viewport } from "next"
import Link from "next/link"
import Nav from "@/components/Nav"
import "./globals.css"

export const metadata: Metadata = {
  title: "OpenList",
  description: "A modern platform for private property listings in Ireland",
  icons: {
    icon: "/favicon-v2.ico",
    apple: "/apple-icon-v2.png",
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
      <head>
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, viewport-fit=cover"
        />
      </head>
      <body className="overflow-x-hidden bg-stone-50 text-stone-900">
        {/* your existing layout content */}
        <div className="border-b border-stone-800 bg-stone-900 text-white">
          <div className="mx-auto max-w-6xl px-4 py-2 text-center text-xs font-medium tracking-[0.14em] sm:px-6 sm:text-sm">
            <span className="opacity-80">Private beta</span>
            <span className="mx-2 opacity-40">·</span>
            Invite-only while we refine the experience
          </div>
        </div>

        <header className="sticky top-0 z-50 border-b border-stone-200/80 bg-white/90 backdrop-blur-md">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <div className="flex items-center justify-between gap-6 py-4 sm:py-5 md:py-6">
              <Link href="/" className="flex shrink-0 items-center">
                <img
                  src="/logo-v2.png"
                  alt="OpenList"
                  className="h-11 w-auto sm:h-14 md:h-20 lg:h-24"
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
                <p className="text-sm font-semibold tracking-tight text-stone-900">
                  OpenList
                </p>

                <p className="mt-3 max-w-md text-sm leading-6 text-stone-600">
                  A modern platform for private property listings in Ireland.
                </p>

                <div className="mt-6 space-y-3 text-xs text-stone-500">
                  <p>OpenList is a marketing platform for private property listings.</p>
                  <p>Listing information is provided by sellers and has not been independently verified.</p>
                  <p>
                    OpenList does not act as an estate agent and does not provide
                    valuation, negotiation, or legal services.
                  </p>
                </div>
              </div>

              <div className="flex flex-col gap-3 text-sm text-stone-600 md:items-end">
                <Link href="/listings" className="hover:text-stone-900">
                  View listings
                </Link>
                <Link href="/my-listings" className="hover:text-stone-900">
                  My listings
                </Link>
                <Link href="/sell" className="hover:text-stone-900">
                  Create a listing
                </Link>
                <Link href="/about" className="hover:text-stone-900">
                  About OpenList
                </Link>
              </div>
            </div>

            <div className="mt-10 border-t border-stone-200 pt-6 text-xs text-stone-400">
              © {new Date().getFullYear()} OpenList. All rights reserved.
            </div>
          </div>
        </footer>
      </body>
    </html>
  )
}