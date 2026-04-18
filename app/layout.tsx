import type { Metadata } from "next"
import Link from "next/link"
import "./globals.css"

export const metadata: Metadata = {
  title: "OpenList",
  description: "A modern platform for private property listings in Ireland",
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className="bg-stone-50 text-stone-900">
        {/* HEADER */}
        <header className="sticky top-0 z-50 border-b border-stone-200 bg-white/80 backdrop-blur">
          <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
            <Link href="/" className="text-lg font-semibold tracking-tight">
              OpenList
            </Link>

            <nav className="flex items-center gap-6 text-sm text-stone-600">
              <Link
                href="/listings"
                className="transition hover:text-stone-900"
              >
                Browse
              </Link>
              <Link
                href="/sell"
                className="transition hover:text-stone-900"
              >
                Sell
              </Link>
              <Link
                href="/about"
                className="transition hover:text-stone-900"
              >
                About
              </Link>
            </nav>

            <Link
              href="/sell"
              className="hidden rounded-full bg-stone-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-stone-700 sm:inline-block"
            >
              Start selling
            </Link>
          </div>
        </header>

        {/* PAGE */}
        {children}

        {/* FOOTER */}
        <footer className="mt-16 border-t border-stone-200 bg-white">
          <div className="mx-auto max-w-6xl px-6 py-10">
            <div className="grid gap-10 md:grid-cols-2">
              <div>
                <p className="text-sm font-semibold tracking-tight text-stone-900">
                  OpenList
                </p>

                <p className="mt-3 max-w-md text-sm leading-6 text-stone-600">
                  A modern platform for private property listings in Ireland.
                </p>

                <div className="mt-6 space-y-3 text-xs leading-5 text-stone-500">
                  <p>
                    OpenList is a marketing platform for private property listings.
                  </p>
                  <p>
                    Listing information is provided by sellers and has not been independently verified.
                  </p>
                  <p>
                    OpenList does not act as an estate agent and does not provide
                    valuation, negotiation, or legal services. Interested parties
                    should satisfy themselves as to accuracy.
                  </p>
                </div>
              </div>

              <div className="flex flex-col gap-3 text-sm text-stone-600 md:items-end">
                <Link href="/listings" className="hover:text-stone-900">
                  Browse listings
                </Link>
                <Link href="/sell" className="hover:text-stone-900">
                  Sell your property
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