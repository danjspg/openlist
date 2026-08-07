"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import SignOutButton from "@/components/SignOutButton"

const navItems = [
  { href: "/sold-prices", label: "Sold prices" },
  { href: "/planning", label: "Planning" },
  { href: "/viewings", label: "Viewings" },
  { href: "/about", label: "About" },
]

export default function Nav({
  isSellerAuthenticated,
}: {
  isSellerAuthenticated: boolean
}) {
  const pathname = usePathname()

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
          {isSellerAuthenticated ? (
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

      <div className="flex items-center gap-5 overflow-x-auto border-t border-stone-200/70 py-3 text-[15px] md:hidden">
        {navItems.map((item) => {
          const isActive =
            pathname === item.href || pathname.startsWith(`${item.href}/`)

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`shrink-0 font-medium transition ${
                isActive
                  ? "text-stone-900"
                  : "text-stone-500 hover:text-stone-900"
              }`}
            >
              {item.label}
            </Link>
          )
        })}

        {isSellerAuthenticated ? (
          <Link
            href="/my-viewings"
            className={`shrink-0 font-medium transition ${
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
            className="shrink-0 font-medium text-stone-500 transition hover:text-stone-900"
          >
            Sign in
          </Link>
        )}
      </div>
    </>
  )
}
