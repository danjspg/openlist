import type { Metadata, Viewport } from "next"
import { Analytics } from "@vercel/analytics/next"
import { SpeedInsights } from "@vercel/speed-insights/next"
import Image from "next/image"
import Link from "next/link"
import AccountFooterLink from "@/components/AccountFooterLink"
import AuthStateProvider from "@/components/AuthStateProvider"
import Nav from "@/components/Nav"
import SmartSearchEnhancer from "@/components/SmartSearchEnhancer"
import "./globals.css"

export const metadata: Metadata = { title: "OpenList | Property Intelligence for Ireland", description: "Search Irish sold prices and planning applications. Research properties, neighbourhoods and development activity in one place.", metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || "https://www.openlist.ie"), icons: { icon: [{ url: "/favicon-v2.ico?v=2", sizes: "16x16 32x32", type: "image/x-icon" }], shortcut: "/favicon-v2.ico?v=2", apple: [{ url: "/apple-icon-v2.png?v=2", sizes: "180x180", type: "image/png" }] } }
export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover" }

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en" className="overflow-x-hidden"><body className="overflow-x-hidden bg-stone-50 text-stone-900"><AuthStateProvider>
    <header className="sticky top-0 z-50 border-b border-stone-200/80 bg-white/90 backdrop-blur-md"><div className="mx-auto max-w-6xl px-4 sm:px-6"><div className="flex flex-wrap items-center justify-between gap-x-4 py-3 sm:py-4 md:flex-nowrap md:py-4"><Link prefetch={false} href="/" className="flex shrink-0 items-center"><Image src="/logo-small.png" alt="OpenList" width={180} height={180} className="h-[45px] w-[45px] sm:hidden" priority /><Image src="/logo-v2.png" alt="OpenList" width={450} height={131} className="hidden h-auto w-56 sm:block md:w-60 lg:w-64" priority /></Link><Nav /></div></div></header>
    <SmartSearchEnhancer />
    {children}
    <footer className="mt-16 border-t border-stone-200 bg-white"><div className="mx-auto max-w-6xl px-4 py-10 sm:px-6"><div className="grid gap-10 lg:grid-cols-[1.05fr_1.65fr] lg:gap-14"><div><Link prefetch={false} href="/" aria-label="OpenList homepage" className="inline-flex"><Image src="/logo-v2.png" alt="OpenList" width={450} height={131} className="h-auto w-40" /></Link><p className="mt-4 max-w-md text-sm leading-6 text-stone-600">Irish planning applications and sold-price data, organised to make local research faster and easier to understand.</p><p className="mt-4 max-w-md text-xs leading-5 text-stone-400">Public-data research only. Always check the relevant official source before relying on a record.</p></div>
      <nav aria-label="Footer" className="grid grid-cols-2 gap-x-7 gap-y-9 text-sm text-stone-600 sm:grid-cols-4">
        <FooterLinkGroup title="Planning"><Link prefetch={false} href="/planning" className="transition hover:text-stone-900">Planning overview</Link><Link prefetch={false} href="/planning/areas" className="transition hover:text-stone-900">Cities, towns & areas</Link><Link prefetch={false} href="/planning#planning-by-authority" className="transition hover:text-stone-900">Local authorities</Link><Link prefetch={false} href="/planning/categories" className="transition hover:text-stone-900">Notable developments</Link></FooterLinkGroup>
        <FooterLinkGroup title="Activity"><Link prefetch={false} href="/planning?construction=commenced" className="transition hover:text-stone-900">Construction started</Link><Link prefetch={false} href="/planning?status=appealed" className="transition hover:text-stone-900">Under appeal</Link><Link prefetch={false} href="/planning?status=appeal_decided" className="transition hover:text-stone-900">Appeal decided</Link><Link prefetch={false} href="/planning?status=further_information_requested" className="transition hover:text-stone-900">Further information</Link><Link prefetch={false} href="/planning?status=decision_made" className="transition hover:text-stone-900">Recent decisions</Link></FooterLinkGroup>
        <FooterLinkGroup title="Property"><Link prefetch={false} href="/sold-prices/search" className="transition hover:text-stone-900">Search sold prices</Link><Link prefetch={false} href="/sold-prices" className="transition hover:text-stone-900">Market overview</Link><Link prefetch={false} href="/sold-prices/counties-compared" className="transition hover:text-stone-900">Compare counties</Link><AccountFooterLink /></FooterLinkGroup>
        <FooterLinkGroup title="About"><Link prefetch={false} href="/about" className="transition hover:text-stone-900">About OpenList</Link><Link prefetch={false} href="/data-sources" className="transition hover:text-stone-900">Data sources</Link><Link prefetch={false} href="/privacy" className="transition hover:text-stone-900">Privacy</Link><Link prefetch={false} href="/terms" className="transition hover:text-stone-900">Terms</Link></FooterLinkGroup>
      </nav></div><div className="mt-10 border-t border-stone-200 pt-6 text-xs text-stone-400"><span>© {new Date().getFullYear()} OpenList. All rights reserved.</span></div></div></footer>
  </AuthStateProvider><Analytics /><SpeedInsights /></body></html>
}
function FooterLinkGroup({ title, children }: { title: string; children: React.ReactNode }) { return <div><h2 className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-400">{title}</h2><div className="mt-3 flex flex-col gap-3">{children}</div></div> }
