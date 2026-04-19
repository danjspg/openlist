import type { Metadata } from "next"
import Link from "next/link"
import "./globals.css"

export const metadata: Metadata = {
  title: "OpenList",
  description: "A modern platform for private property listings in Ireland",
  icons: {
    icon: "/favicon.ico",
    apple: "/apple-icon.png",
  },
}

const navItems = [
  { href: "/listings", label: "Listings" },
  { href: "/about", label: "About" },
]

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className="bg-stone-50 text-stone-900">

        {/* Private Beta Banner */}
        <div className="border-b border-stone-800 bg-stone-900 text-white">
          <div className="mx-auto max-w-6xl px-4 py-2 text-center text-xs font-medium tracking-[0.14em] sm:px-6 sm:text-sm">
            <span className="opacity-80">Private beta</span>
            <span className="mx-2 opacity-40">·</span>
            Invite-only while we refine the experience
          </div>
        </div>

        {/* Header */}
        <header className="sticky top-0 z-50 border-b border-stone-200/80 bg-white/90 backdrop-blur-md">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">

            <div className="flex items-center justify-between gap-4 py-5 sm:py-6">

              {/* Logo (final version) */}
              <Link href="/" className="flex shrink-0 items-center">
                <img
                  src="/logo.png"
                  alt="OpenList"
                  className="h-16 w-auto sm:h-[72px]"
                />
              </Link>

              {/* Desktop nav */}
              <nav className="hidden items-center gap-8 md:flex">
                {navItems.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className="group relative text-[16px] font-medium tracking-tight text-stone-600 transition hover:text-stone-900"
                  >
                    {item.label}
                    <span className="absolute left-0 top-full mt-1 h-[1.5px] w-full origin-left scale-x-0 bg-stone-900 transition-transform duration-200 group-hover:scale-x-100" />
                  </Link>
                ))}
              </nav>

              {/* Right actions */}
              <div className="hidden items-center gap-3 md:flex">
                <Link
                  href="/my-listings"
                  className="inline-flex items-center rounded-full border border-stone-300 px-5 py-2.5 text-base font-medium text-stone-700 transition hover:border-stone-900 hover:text-stone-900"
                >
                  My listings
                </Link>

                <Link
                  href="/sell"
                  className="inline-flex items-center rounded-full bg-stone-900 px-6 py-2.5 text-base font-medium text-white shadow-sm transition hover:bg-stone-700"
                >
                  Create a listing
                </Link>
              </div>
            </div>

            {/* Mobile nav */}
            <div className="flex items-center gap-5 overflow-x-auto border-t border-stone-200/70 py-3 text-[15px] md:hidden">
              <Link
                href="/listings"
                className="shrink-0 font-medium text-stone-600 transition hover:text-stone-900"
              >
                Listings
              </Link>

              <Link
                href="/about"
                className="shrink-0 font-medium text-stone-600 transition hover:text-stone-900"
              >
                About
              </Link>

              <Link
                href="/my-listings"
                className="shrink-0 font-medium text-stone-600 transition hover:text-stone-900"
              >
                My listings
              </Link>

              <Link
                href="/sell"
                className="ml-auto inline-flex shrink-0 items-center rounded-full bg-stone-900 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-stone-700"
              >
                Create listing
              </Link>
            </div>
          </div>
        </header>

        {children}

        {/* Footer */}
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

                <div className="mt-6 space-y-3 text-xs leading-5 text-stone-500">
                  <p>OpenList is a marketing platform for private property listings.</p>
                  <p>Listing information is provided by sellers and has not been independently verified.</p>
                  <p>
                    OpenList does not act as an estate agent and does not provide
                    valuation, negotiation, or legal services. Interested parties
                    should satisfy themselves as to accuracy.
                  </p>
                </div>
              </div>

              <div className="flex flex-col gap-3 text-sm text-stone-600 md:items-end">
                <Link href="/listings" className="transition hover:text-stone-900">
                  View listings
                </Link>
                <Link href="/my-listings" className="transition hover:text-stone-900">
                  My listings
                </Link>
                <Link href="/sell" className="transition hover:text-stone-900">
                  Create a listing
                </Link>
                <Link href="/about" className="transition hover:text-stone-900">
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