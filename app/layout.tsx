"use client"

import type { Metadata } from "next"
import Link from "next/link"
import { usePathname } from "next/navigation"
import "./globals.css"

export const metadata: Metadata = {
  title: "OpenList",
  description: "A modern platform for private property listings in Ireland",
  icons: {
    icon: "/favicon-v2.ico",
    apple: "/apple-icon-v2.png",
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
  const pathname = usePathname()

  return (
    <html lang="en">
      <body className="bg-stone-50 text-stone-900">

        {/* Beta banner */}
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

            <div className="flex items-center justify-between gap-6 py-6 sm:py-7">

              {/* Logo */}
              <Link href="/" className="flex shrink-0 items-center">
                <img
                  src="/logo-v2.png"
                  alt="OpenList"
                  className="h-20 w-auto sm:h-24"
                />
              </Link>

              {/* Right cluster */}
              <div className="hidden items-center gap-6 md:flex">

                {/* Nav */}
                <nav className="flex items-center gap-8">
                  {navItems.map((item) => {
                    const isActive = pathname.startsWith(item.href)

                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        className={`group relative text-[17px] font-medium tracking-tight transition
                          ${
                            isActive
                              ? "text-stone-900"
                              : "text-stone-500 hover:text-stone-900"
                          }`}
                      >
                        {item.label}

                        {/* underline */}
                        <span
                          className={`absolute left-0 top-full mt-1 h-[1.5px] w-full origin-left transition-transform duration-200
                            ${
                              isActive
                                ? "scale-x-100 bg-stone-900"
                                : "scale-x-0 bg-stone-900 group-hover:scale-x-100"
                            }`}
                        />
                      </Link>
                    )
                  })}
                </nav>

                {/* Actions */}
                <div className="flex items-center gap-3">
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
            </div>

            {/* Mobile nav */}
            <div className="flex items-center gap-5 overflow-x-auto border-t border-stone-200/70 py-3 text-[15px] md:hidden">
              {navItems.map((item) => {
                const isActive = pathname.startsWith(item.href)

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`shrink-0 font-medium transition
                      ${
                        isActive
                          ? "text-stone-900"
                          : "text-stone-500 hover:text-stone-900"
                      }`}
                  >
                    {item.label}
                  </Link>
                )
              })}

              <Link
                href="/my-listings"
                className="shrink-0 font-medium text-stone-500 hover:text-stone-900"
              >
                My listings
              </Link>

              <Link
                href="/sell"
                className="ml-auto inline-flex shrink-0 items-center rounded-full bg-stone-900 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-stone-700"
              >
                Create listing
              </Link>
            </div>
          </div>
        </header>

        {children}

        {/* Footer unchanged */}
      </body>
    </html>
  )
}