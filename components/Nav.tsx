"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import SignOutButton from "@/components/SignOutButton"
import { useAuthState } from "@/components/AuthStateProvider"
import { shouldShowMyViewings } from "@/lib/account-navigation"

const navItems = [
  { href: "/planning", label: "Planning" },
  { href: "/sold-prices", label: "Sold prices" },
  { href: "/search", label: "Search" },
  { href: "/about", label: "About" },
]

const planningExploreGroups = [
  {
    title: "Browse by place",
    links: [
      { href: "/planning/areas", label: "Cities, towns & areas", detail: "Browse local planning pages" },
      { href: "/planning#planning-by-authority", label: "Local authorities", detail: "Explore council planning" },
      { href: "/sold-prices", label: "Counties & property market", detail: "Sold-price context" },
    ],
  },
  {
    title: "Significant planning",
    links: [
      { href: "/planning/categories", label: "Notable developments", detail: "Major schemes by category" },
      { href: "/planning/categories/residential-development", label: "Residential", detail: "Significant housing" },
      { href: "/planning/categories/retail", label: "Retail", detail: "Significant retail schemes" },
      { href: "/planning/categories/infrastructure", label: "Infrastructure", detail: "Major infrastructure projects" },
    ],
  },
  {
    title: "Activity & decisions",
    links: [
      { href: "/planning?construction=commenced", label: "Construction started", detail: "Verified commencement records" },
      { href: "/planning?status=appealed", label: "Under appeal", detail: "Applications with an appeal lodged" },
      { href: "/planning?status=appeal_decided", label: "Appeal decided", detail: "Applications with a recorded appeal outcome" },
      { href: "/planning?status=further_information_requested", label: "Further information", detail: "Applications awaiting more detail" },
      { href: "/planning?status=decision_made", label: "Recent decisions", detail: "Decision-stage applications" },
    ],
  },
]

export default function Nav() {
  const pathname = usePathname()
  const { isAuthenticated, hasViewings } = useAuthState()
  const showMyViewings = shouldShowMyViewings(isAuthenticated, hasViewings)

  return (
    <>
      <div className="hidden items-center gap-5 md:flex">
        <nav className="flex items-center gap-6">
          <div className="group/planning relative py-3">
            <Link href="/planning" className={`relative text-[17px] font-medium tracking-tight transition ${pathname.startsWith("/planning") ? "text-stone-900" : "text-stone-500 hover:text-stone-900"}`}>
              Planning <span aria-hidden="true" className="ml-1 text-xs">⌄</span>
            </Link>
            <div className="invisible absolute left-1/2 top-full z-50 w-[760px] -translate-x-[38%] translate-y-2 rounded-2xl border border-stone-200 bg-white p-5 opacity-0 shadow-xl transition duration-150 group-hover/planning:visible group-hover/planning:translate-y-0 group-hover/planning:opacity-100 group-focus-within/planning:visible group-focus-within/planning:translate-y-0 group-focus-within/planning:opacity-100">
              <div className="mb-4 flex items-center justify-between border-b border-stone-100 pb-4">
                <div><p className="text-sm font-semibold text-stone-950">Explore planning</p><p className="mt-1 text-xs text-stone-500">Find places, significant developments and applications by stage.</p></div>
                <Link href="/planning" className="text-sm font-semibold text-emerald-800 hover:underline">Planning overview →</Link>
              </div>
              <div className="grid grid-cols-3 gap-5">
                {planningExploreGroups.map((group) => <div key={group.title}><p className="text-xs font-semibold uppercase tracking-[0.14em] text-stone-400">{group.title}</p><div className="mt-2 space-y-1">{group.links.map((link) => <Link key={link.href + link.label} href={link.href} className="block rounded-lg px-2 py-2 transition hover:bg-stone-50"><span className="block text-sm font-semibold text-stone-800">{link.label}</span><span className="mt-0.5 block text-xs text-stone-500">{link.detail}</span></Link>)}</div></div>)}
              </div>
            </div>
          </div>
          {navItems.slice(1).map((item) => {
            const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`)
            return <Link key={item.href} href={item.href} className={`group relative text-[17px] font-medium tracking-tight transition ${isActive ? "text-stone-900" : "text-stone-500 hover:text-stone-900"}`}>{item.label}<span className={`absolute left-0 top-full mt-1 h-[1.5px] w-full origin-left bg-stone-900 transition-transform duration-200 ${isActive ? "scale-x-100" : "scale-x-0 group-hover:scale-x-100"}`} /></Link>
          })}
        </nav>

        <div className="flex items-center gap-3">
          {isAuthenticated ? <><Link href="/my-alerts" className={`inline-flex items-center rounded-full border px-5 py-2.5 text-base font-medium transition ${pathname === "/my-alerts" ? "border-stone-900 text-stone-900" : "border-stone-300 text-stone-700 hover:border-stone-900 hover:text-stone-900"}`}>My alerts</Link>{showMyViewings ? <Link href="/my-viewings" className={`inline-flex items-center rounded-full border px-5 py-2.5 text-base font-medium transition ${pathname === "/my-viewings" || pathname.startsWith("/my-viewings/") ? "border-stone-900 text-stone-900" : "border-stone-300 text-stone-700 hover:border-stone-900 hover:text-stone-900"}`}>My viewings</Link> : null}<SignOutButton /></> : <Link href="/sign-in?redirectTo=%2Fmy-alerts" className="inline-flex items-center rounded-full border border-stone-300 px-5 py-2.5 text-base font-medium text-stone-700 transition hover:border-stone-900 hover:text-stone-900">Sign in</Link>}
        </div>
      </div>

      <nav className="flex w-full basis-full items-center justify-between gap-2 overflow-x-auto border-t border-stone-200/70 py-1 text-sm md:hidden" aria-label="Primary navigation">
        {navItems.map((item) => {
          const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`)
          return <Link key={item.href} href={item.href} aria-label={item.href === "/search" ? "Search" : undefined} className={`inline-flex min-h-11 shrink-0 items-center font-medium transition ${isActive ? "text-stone-900" : "text-stone-500 hover:text-stone-900"}`}>{item.href === "/search" ? <><span className="sr-only">Search</span><svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><circle cx="11" cy="11" r="6.5" /><path d="m16 16 4 4" /></svg></> : item.label}</Link>
        })}
        {isAuthenticated ? <><Link href="/my-alerts" className={`inline-flex min-h-11 shrink-0 items-center font-medium transition ${pathname === "/my-alerts" ? "text-stone-900" : "text-stone-500 hover:text-stone-900"}`}>My alerts</Link>{showMyViewings ? <Link href="/my-viewings" className={`inline-flex min-h-11 shrink-0 items-center font-medium transition ${pathname === "/my-viewings" || pathname.startsWith("/my-viewings/") ? "text-stone-900" : "text-stone-500 hover:text-stone-900"}`}>My viewings</Link> : null}</> : <Link href="/sign-in?redirectTo=%2Fmy-alerts" className="inline-flex min-h-11 shrink-0 items-center font-medium text-stone-500 transition hover:text-stone-900">Sign in</Link>}
      </nav>
    </>
  )
}
