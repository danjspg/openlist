"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"

const navItems = [
  { href: "/listings", label: "Listings" },
  { href: "/about", label: "About" },
]

export default function Nav() {
  const pathname = usePathname()

  return (
    <>
      <div className="hidden items-center gap-6 md:flex">
        <nav className="flex items-center gap-8">
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
          <Link
            href="/my-listings"
            className={`inline-flex items-center rounded-full border px-5 py-2.5 text-base font-medium transition ${
              pathname === "/my-listings"
                ? "border-stone-900 text-stone-900"
                : "border-stone-300 text-stone-700 hover:border-stone-900 hover:text-stone-900"
            }`}
          >
            My listings
          </Link>

          <Link
            href="/sell"
            className={`inline-flex items-center rounded-full px-6 py-2.5 text-base font-medium text-white shadow-sm transition ${
              pathname === "/sell"
                ? "bg-stone-700"
                : "bg-stone-900 hover:bg-stone-700"
            }`}
          >
            Create a listing
          </Link>
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

        <Link
          href="/my-listings"
          className={`shrink-0 font-medium transition ${
            pathname === "/my-listings"
              ? "text-stone-900"
              : "text-stone-500 hover:text-stone-900"
          }`}
        >
          My listings
        </Link>

        <Link
          href="/sell"
          className={`ml-auto inline-flex shrink-0 items-center rounded-full px-4 py-2 text-sm font-medium text-white shadow-sm transition ${
            pathname === "/sell"
              ? "bg-stone-700"
              : "bg-stone-900 hover:bg-stone-700"
          }`}
        >
          Create listing
        </Link>
      </div>
    </>
  )
}