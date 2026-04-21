import type { Metadata, Viewport } from "next"
import { Analytics } from "@vercel/analytics/next"
import Image from "next/image"
import Link from "next/link"
import Nav from "@/components/Nav"
import { getCurrentSellerUser } from "@/lib/seller-auth"
import "./globals.css"

export const metadata: Metadata = {
  title: "OpenList",
  description: "A private home sale platform for Ireland.",
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

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const currentSellerUser = await getCurrentSellerUser()

  return (
    <html lang="en" className="overflow-x-hidden">
      <body className="overflow-x-hidden bg-stone-50 text-stone-900">
        <div className="border-b border-stone-800 bg-stone-900 text-white">
          <div className="mx-auto max-w-6xl px-4 py-2 text-center text-xs font-medium tracking-[0.14em] sm:px-6 sm:text-sm">
            <span className="opacity-80">Private beta</span>
            <span className="mx-2 opacity-40">·</span>
            Invite-only while we refine the experience
          </div>
        </div>

        <header className="sticky top-0 z-50 border-b border-stone-200/80 bg-white/90 backdrop-blur-md">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <div className="flex items-center justify-between gap-4 py-3 sm:py-5 md:py-6">
              <Link href="/" className="flex shrink-0 items-center">
                <Image
                  src="/logo-small.png"
                  alt="OpenList"
                  width={160}
                  height={45}
                  className="h-[45px] w-auto sm:hidden"
                />

                <Image
                  src="/logo.png"
                  alt="OpenList"
                  width={420}
                  height={126}
                  className="hidden h-[78px] w-auto sm:block md:h-[110px] lg:h-[126px]"
                />
              </Link>

              <Nav isSellerAuthenticated={Boolean(currentSellerUser)} />
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
                    src="/logo-small.png"
                    alt="OpenList"
                    width={114}
                    height={32}
                    className="h-8 w-auto"
                  />
                </div>

                <p className="mt-4 max-w-md text-sm leading-6 text-stone-600">
                  A private home sale platform for Ireland.
                </p>

                <div className="mt-6 space-y-3 text-xs leading-5 text-stone-500">
                  <p>
                    OpenList is a platform for private property sales in Ireland.
                  </p>
                  <p>
                    Listing details are provided by sellers and have not been independently verified.
                  </p>
                  <p>
                    OpenList is not an estate agent or auctioneer and does not provide valuation services, pricing advice, negotiation services, legal services, brokerage services, or transaction management. Buyers and sellers deal directly, and all parties should satisfy themselves as to the accuracy of any information.
                  </p>
                </div>
              </div>

              <div className="flex flex-col gap-3 text-sm text-stone-600 md:items-end md:pt-12">
                <Link href="/listings" className="transition hover:text-stone-900">
                  View listings
                </Link>
                <Link href="/sold-prices" className="transition hover:text-stone-900">
                  Sold prices
                </Link>
                <Link href="/my-listings" className="transition hover:text-stone-900">
                  My listings
                </Link>
                <Link href="/sell" className="transition hover:text-stone-900">
                  Start your listing
                </Link>
                <Link href="/about" className="transition hover:text-stone-900">
                  About OpenList
                </Link>
                <Link href="/terms" className="transition hover:text-stone-900">
                  Terms
                </Link>
                <Link href="/admin/access" className="text-stone-400 transition hover:text-stone-700">
                  Admin
                </Link>
              </div>
            </div>

            <div className="mt-10 border-t border-stone-200 pt-6 text-xs text-stone-400">
              © {new Date().getFullYear()} OpenList. All rights reserved.
            </div>
          </div>
        </footer>
        <Analytics />
      </body>
    </html>
  )
}
