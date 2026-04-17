import "./globals.css"
import Link from "next/link"
import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "OpenList",
  description:
    "Sell your property directly with a modern, simple listing platform.",
  robots: {
    index: false,
    follow: false,
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className="bg-white text-slate-900 antialiased">
        <header className="border-b border-slate-200 bg-white">
          <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
            <Link href="/" className="flex items-center">
              <img
                src="/logo.jpg"
                alt="OpenList"
                className="h-18 w-auto object-contain"
              />
            </Link>

            <nav className="flex items-center gap-8">
              <Link
                href="/my-listings"
                className="text-base font-medium text-slate-700 transition hover:text-slate-900"
              >
                Dashboard
              </Link>

              <Link
                href="/listings"
                className="text-base font-medium text-slate-700 transition hover:text-slate-900"
              >
                Listings
              </Link>

              <Link
                href="/about"
                className="text-base font-medium text-slate-700 transition hover:text-slate-900"
              >
                About
              </Link>

              <Link
                href="/sell"
                className="inline-flex items-center rounded-full bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-700"
              >
                Sell
              </Link>
            </nav>
          </div>
        </header>

        <div className="border-b border-amber-200 bg-amber-50">
          <div className="mx-auto max-w-7xl px-6 py-2 text-sm text-amber-900">
            OpenList is currently in private beta. Features may change.
          </div>
        </div>

        <main>{children}</main>
      </body>
    </html>
  )
}