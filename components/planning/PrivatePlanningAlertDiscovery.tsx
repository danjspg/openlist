"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { createPortal } from "react-dom"
import { useEffect, useState } from "react"
import { useAuthState } from "@/components/AuthStateProvider"

export function PrivatePlanningAlertDiscovery() {
  const pathname = usePathname()
  const { isAuthenticated, isResolved } = useAuthState()
  const [host, setHost] = useState<HTMLElement | null>(null)
  const isPlanningHomepage = pathname === "/planning"

  useEffect(() => {
    if (!isResolved || !isAuthenticated || !isPlanningHomepage) return
    const hero = document.querySelector("main > section:first-child")
    if (!(hero instanceof HTMLElement)) return

    const container = document.createElement("div")
    container.dataset.privatePlanningAlertDiscovery = "true"
    hero.insertAdjacentElement("afterend", container)
    const frame = window.requestAnimationFrame(() => setHost(container))

    return () => {
      window.cancelAnimationFrame(frame)
      setHost(null)
      container.remove()
    }
  }, [isAuthenticated, isPlanningHomepage, isResolved])

  if (!isResolved || !isAuthenticated || !isPlanningHomepage || !host || !host.isConnected) return null

  return createPortal(
    <div className="mx-auto max-w-6xl px-4 pt-6 sm:px-6">
      <section className="rounded-2xl border border-emerald-200 bg-emerald-50/70 p-5 shadow-sm sm:flex sm:items-center sm:justify-between sm:gap-6 sm:p-6" aria-label="Planning area alerts">
        <div className="max-w-2xl">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-800">Area alerts</p>
          <h2 className="mt-2 text-xl font-semibold tracking-tight text-stone-950">Get notified about new planning near an area</h2>
          <p className="mt-2 text-sm leading-6 text-stone-600">
            Choose a city, town or local area, then pick residential, significant or all new planning applications and how far around it to watch.
          </p>
        </div>
        <div className="mt-4 flex shrink-0 flex-wrap gap-3 sm:mt-0">
          <Link href="/planning/areas" className="inline-flex min-h-11 items-center justify-center rounded-xl bg-emerald-700 px-5 text-sm font-semibold text-white transition hover:bg-emerald-800">
            Choose an area
          </Link>
          <Link href="/my-alerts/areas" className="inline-flex min-h-11 items-center justify-center rounded-xl border border-emerald-300 bg-white px-5 text-sm font-semibold text-emerald-900 transition hover:border-emerald-500">
            Manage alerts
          </Link>
        </div>
      </section>
    </div>,
    host
  )
}
