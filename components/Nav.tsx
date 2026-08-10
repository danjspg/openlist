"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import SignOutButton from "@/components/SignOutButton"
import { useAuthState } from "@/components/AuthStateProvider"

const navItems = [
  { href: "/sold-prices", label: "Sold prices" },
  { href: "/planning", label: "Planning" },
  { href: "/search", label: "Search" },
  { href: "/about", label: "About" },
]

export default function Nav() {
  const pathname = usePathname()
  const { isAuthenticated } = useAuthState()

  return (
    <>
      <div className="hidden items-center gap-5 md:flex">
        <nav className="flex items-center gap-6">
          {navItems.map((item) => {
            const isActive =
              pathname === item.href || pathname.startsWith(`${item.href}/`)

            return (
              <Link
                key={item.href}
                href={item.href}
                className={`group relative text-[17px] font-medium tracking-tight transition ${
                  isActive
                    ? "text-stone-900"
                    : "text-stone-500 hover:text-stone-900"
                }`}
              >
                {item.label}
                <span
                  className={`absolute left-0 top-full mt-1 h-[1.5px] w-full origin-left bg-stone-900 transition-transform duration-200 ${
                    isActive
                      ? "scale-x-100"
                      : "scale-x-0 group-hover:scale-x-100"
                  }`}
                />
              </Link>
            )
          })}
        </nav>

        <div className="flex items-center gap-3">
          {isAuthenticated ? (
            <>
              <Link
                href="/my-viewings"
                className={`inline-flex items-center rounded-full border px-5 py-2.5 text-base font-medium transition ${
                  pathname === "/my-viewings" ||
                  pathname.startsWith("/my-viewings/")
                    ? "border-stone-900 text-stone-900"
                    : "border-stone-300 text-stone-700 hover:border-stone-900 hover:text-stone-900"
                }`}
              >
                My viewings
              </Link>
              <SignOutButton />
            </>
          ) : (
            <Link
              href="/sign-in?redirectTo=%2Fmy-viewings"
              className="inline-flex items-center rounded-full border border-stone-300 px-5 py-2.5 text-base font-medium text-stone-700 transition hover:border-stone-900 hover:text-stone-900"
            >
              Sign in
            </Link>
          )}
        </div>
      </div>

      <nav
        className="flex w-full basis-full items-center justify-between gap-2 overflow-x-auto border-t border-stone-200/70 py-1 text-sm md:hidden"
        aria-label="Primary navigation"
      >
        {navItems.map((item) => {
          const isActive =
            pathname === item.href || pathname.startsWith(`${item.href}/`)

          return (
            <Link
              key={item.href}
              href={item.href}
              aria-label={item.href === "/search" ? "Search" : undefined}
              className={`inline-flex min-h-11 shrink-0 items-center font-medium transition ${
                isActive
                  ? "text-stone-900"
                  : "text-stone-500 hover:text-stone-900"
              }`}
            >
              {item.href === "/search" ? (
                <>
                  <span className="sr-only">Search</span>
                  <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                    <circle cx="11" cy="11" r="6.5" />
                    <path d="m16 16 4 4" />
                  </svg>
                </>
              ) : item.label}
            </Link>
          )
        })}

        {isAuthenticated ? (
          <Link
            href="/my-viewings"
            className={`inline-flex min-h-11 shrink-0 items-center font-medium transition ${
              pathname === "/my-viewings" || pathname.startsWith("/my-viewings/")
                ? "text-stone-900"
                : "text-stone-500 hover:text-stone-900"
            }`}
          >
            My viewings
          </Link>
        ) : (
          <Link
            href="/sign-in?redirectTo=%2Fmy-viewings"
            className="inline-flex min-h-11 shrink-0 items-center font-medium text-stone-500 transition hover:text-stone-900"
          >
            Sign in
          </Link>
        )}
      </nav>
    </>
  )
}
