"use client"

import { useEffect, useMemo, useState } from "react"
import { usePathname } from "next/navigation"

type FreshnessResponse = {
  planning: string | null
  soldPrices: string | null
}

function formatFreshnessDate(value: string | null) {
  if (!value) return null
  const date = new Date(`${value}T00:00:00Z`)
  if (Number.isNaN(date.getTime())) return null

  return new Intl.DateTimeFormat("en-IE", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(date)
}

export default function DataFreshnessBanner() {
  const pathname = usePathname()
  const [freshness, setFreshness] = useState<FreshnessResponse | null>(null)

  const scope = useMemo(() => {
    if (pathname === "/planning" || pathname.startsWith("/planning/")) return "planning"
    if (pathname === "/sold-prices" || pathname.startsWith("/sold-prices/")) return "soldPrices"
    return null
  }, [pathname])

  useEffect(() => {
    if (!scope || freshness) return

    const controller = new AbortController()
    fetch("/api/data-freshness", { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error(`Freshness request failed: ${response.status}`)
        return response.json() as Promise<FreshnessResponse>
      })
      .then(setFreshness)
      .catch((error) => {
        if (error instanceof DOMException && error.name === "AbortError") return
        console.warn("Could not load data freshness", error)
      })

    return () => controller.abort()
  }, [scope, freshness])

  if (!scope || !freshness) return null

  const rawDate = scope === "planning" ? freshness.planning : freshness.soldPrices
  const date = formatFreshnessDate(rawDate)
  if (!date) return null

  const source =
    scope === "planning" ? "Irish local authorities" : "Property Price Register"
  const label = scope === "planning" ? "Planning data" : "Sold-price data"

  return (
    <div className="border-b border-stone-200 bg-stone-50/90">
      <div className="mx-auto flex max-w-6xl items-center gap-2 px-4 py-2 text-xs text-stone-600 sm:px-6">
        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" aria-hidden="true" />
        <p>
          <span className="font-medium text-stone-800">{label} current to {date}</span>
          <span className="text-stone-400"> · </span>
          Source: {source}
        </p>
      </div>
    </div>
  )
}
