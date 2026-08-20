"use client"

import Link from "next/link"
import { useEffect, useMemo, useState } from "react"
import { usePathname } from "next/navigation"

type FreshnessResponse = {
  planning: string | null
  planningCount: number | null
  planningAuthority: string | null
  soldPrices: string | null
  soldPriceCount: number | null
  soldPriceStartYear: number | null
}

type FreshnessContext = {
  scope: "planning" | "soldPrices"
  authoritySlug: string | null
  isPlanningDetail: boolean
  key: string
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

function formatCount(value: number | null) {
  if (!value || !Number.isFinite(value)) return null
  return new Intl.NumberFormat("en-IE").format(value)
}

export default function DataFreshnessBanner() {
  const pathname = usePathname()
  const [freshness, setFreshness] = useState<{ key: string; data: FreshnessResponse } | null>(null)
  const [shareLabel, setShareLabel] = useState("Share application")

  const context = useMemo<FreshnessContext | null>(() => {
    const segments = pathname.split("/").filter(Boolean)

    if (segments[0] === "planning") {
      const authoritySlug = segments.length >= 2 && segments[1] !== "applications" ? segments[1] : null
      return {
        scope: "planning",
        authoritySlug,
        isPlanningDetail: Boolean(authoritySlug && segments.length >= 3),
        key: `planning:${authoritySlug || "national"}`,
      }
    }

    if (segments[0] === "sold-prices") {
      return {
        scope: "soldPrices",
        authoritySlug: null,
        isPlanningDetail: false,
        key: "soldPrices",
      }
    }

    return null
  }, [pathname])

  useEffect(() => {
    if (!context) return

    const controller = new AbortController()
    const query = context.authoritySlug
      ? `?authority=${encodeURIComponent(context.authoritySlug)}`
      : ""

    fetch(`/api/data-freshness${query}`, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error(`Freshness request failed: ${response.status}`)
        return response.json() as Promise<FreshnessResponse>
      })
      .then((data) => setFreshness({ key: context.key, data }))
      .catch((error) => {
        if (error instanceof DOMException && error.name === "AbortError") return
        console.warn("Could not load data freshness", error)
      })

    return () => controller.abort()
  }, [context])

  useEffect(() => {
    setShareLabel("Share application")
  }, [pathname])

  if (!context || freshness?.key !== context.key) return null

  const data = freshness.data
  const rawDate = context.scope === "planning" ? data.planning : data.soldPrices
  const date = formatFreshnessDate(rawDate)
  if (!date) return null

  const count = formatCount(
    context.scope === "planning" ? data.planningCount : data.soldPriceCount
  )

  const handleShare = async () => {
    const url = window.location.href
    const title = document.title

    try {
      if (navigator.share) {
        await navigator.share({ title, url })
        return
      }

      await navigator.clipboard.writeText(url)
      setShareLabel("Link copied")
      window.setTimeout(() => setShareLabel("Share application"), 2200)
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return
      console.warn("Could not share planning application", error)
    }
  }

  return (
    <div className="border-b border-stone-200 bg-stone-50/90">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-2 text-xs text-stone-600 sm:px-6">
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" aria-hidden="true" />
          <p className="min-w-0">
            {context.scope === "planning" ? (
              <>
                <span className="font-medium text-stone-800">
                  {data.planningAuthority ? `${data.planningAuthority} planning data` : "Planning data"} current to {date}
                </span>
                {count ? (
                  <>
                    <span className="text-stone-400"> · </span>
                    {count} applications
                  </>
                ) : null}
                <span className="text-stone-400"> · </span>
                Source: {data.planningAuthority || "Irish local authorities"}
              </>
            ) : (
              <>
                <span className="font-medium text-stone-800">Sold-price data current to {date}</span>
                {count ? (
                  <>
                    <span className="text-stone-400"> · </span>
                    {count} recorded sales
                  </>
                ) : null}
                {data.soldPriceStartYear ? (
                  <>
                    <span className="text-stone-400"> · </span>
                    history from {data.soldPriceStartYear}
                  </>
                ) : null}
                <span className="text-stone-400"> · </span>
                Source: Property Price Register
              </>
            )}
            <span className="text-stone-400"> · </span>
            <Link
              href="/about#data-methodology"
              className="font-medium text-stone-700 underline decoration-stone-300 underline-offset-2 transition hover:text-stone-950"
            >
              How the data works
            </Link>
          </p>
        </div>

        {context.isPlanningDetail ? (
          <button
            type="button"
            onClick={handleShare}
            className="shrink-0 rounded-md border border-stone-300 bg-white px-2.5 py-1.5 font-medium text-stone-700 transition hover:border-stone-400 hover:text-stone-950"
          >
            {shareLabel}
          </button>
        ) : null}
      </div>
    </div>
  )
}
