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
  )
}