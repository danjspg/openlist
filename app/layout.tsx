import type { Metadata } from "next"
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

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
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

              {/* Nav + Actions */}
              <Nav />

            </div>
          </div>
        </header>

        {children}

        {/* Footer (unchanged) */}
      </body>
    </html>
  )
}