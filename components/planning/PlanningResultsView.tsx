"use client"

import "leaflet/dist/leaflet.css"
import { useEffect, useMemo, useRef, useState } from "react"
import { usePathname, useSearchParams } from "next/navigation"
import type { Map as LeafletMap } from "leaflet"
import {
  PlanningApplicationList,
  type PlanningResultRecord,
} from "@/components/planning/PlanningApplicationResult"

export type { PlanningResultLifecycleEvent, PlanningResultRecord } from "@/components/planning/PlanningApplicationResult"

export default function PlanningResultsView({
  applications,
}: {
  applications: PlanningResultRecord[]
}) {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [items, setItems] = useState(applications)
  const [view, setView] = useState<"list" | "map">("list")
  const [loading, setLoading] = useState(false)
  const [searchError, setSearchError] = useState<string | null>(null)
  const [hasMore, setHasMore] = useState(applications.length >= 25)
  const [confirmedEmpty, setConfirmedEmpty] = useState(applications.length > 0)

  useEffect(() => {
    setItems(applications)
    setHasMore(applications.length >= 25)
    setSearchError(null)
    setConfirmedEmpty(applications.length > 0)
  }, [applications])

  const authority = useMemo(() => {
    const segments = pathname.split("/").filter(Boolean)
    if (segments[0] !== "planning" || !segments[1] || segments[1] === "applications") return ""
    return segments[1]
  }, [pathname])

  const apiParams = useMemo(() => {
    const params = new URLSearchParams(searchParams.toString())
    params.delete("_authority")
    params.delete("_vercel_share")
    if (authority) params.set("authority", authority)
    params.set("limit", "25")
    return params
  }, [searchParams, authority])

  useEffect(() => {
    if (applications.length > 0 || searchParams.size === 0) return
    let cancelled = false
    const params = new URLSearchParams(apiParams)
    params.set("offset", "0")

    void fetch(`/api/planning/search?${params.toString()}`, { cache: "no-store" })
      .then(async (response) => {
        const payload = await response.json()
        if (!response.ok) throw new Error(payload.error || "Planning search is temporarily unavailable.")
        if (cancelled) return
        const rows = (payload.results ?? []) as PlanningResultRecord[]
        setItems(rows)
        setHasMore(Boolean(payload.hasMore))
        setConfirmedEmpty(rows.length === 0)
      })
      .catch((error: unknown) => {
        if (cancelled) return
        setSearchError(error instanceof Error ? error.message : "Planning search is temporarily unavailable. Please try again.")
      })

    return () => { cancelled = true }
  }, [applications.length, apiParams, searchParams.size])

  const mappableApplications = items.filter((application) => application.coordinates)
  const resultCount = items.length
  const mappedCount = mappableApplications.length

  async function loadMore() {
    if (loading || !hasMore) return
    setLoading(true)
    setSearchError(null)
    try {
      const params = new URLSearchParams(apiParams)
      params.set("offset", String(items.length))
      const response = await fetch(`/api/planning/search?${params.toString()}`, { cache: "no-store" })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error || "Planning search is temporarily unavailable.")
      const rows = (payload.results ?? []) as PlanningResultRecord[]
      setItems((current) => [...current, ...rows])
      setHasMore(Boolean(payload.hasMore))
      setConfirmedEmpty(true)
    } catch (error) {
      setSearchError(error instanceof Error ? error.message : "Planning search is temporarily unavailable. Please try again.")
    } finally {
      setLoading(false)
    }
  }

  if (searchError && items.length === 0) {
    return (
      <div className="my-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm leading-6 text-amber-950" role="status">
        <p className="font-semibold">Planning search is temporarily unavailable.</p>
        <p className="mt-1">Your filters are still selected. Please try the search again in a moment.</p>
      </div>
    )
  }

  if (items.length === 0 && confirmedEmpty) {
    return (
      <div className="py-12 text-center text-sm text-stone-500">
        No planning applications matched those filters.
      </div>
    )
  }

  if (items.length === 0) {
    return <div className="py-12 text-center text-sm text-stone-500">Checking planning results…</div>
  }

  return (
    <div>
      <div className="flex flex-col gap-3 border-b border-stone-200 py-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm font-medium text-stone-500">
          {resultCount.toLocaleString("en-IE")} {resultCount === 1 ? "result loaded" : "results loaded"}
          {mappedCount > 0 ? (
            <>
              <span aria-hidden="true" className="mx-1.5 text-stone-300">·</span>
              {mappedCount.toLocaleString("en-IE")} mapped
            </>
          ) : null}
        </p>
        {mappedCount > 0 ? (
          <div className="inline-flex w-fit shrink-0 rounded-full border border-stone-200 bg-stone-50 p-1" aria-label="Planning results view">
            {(["list", "map"] as const).map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setView(option)}
                className={`min-h-9 rounded-full px-3 text-sm font-semibold capitalize transition ${
                  view === option
                    ? "bg-white text-stone-950 shadow-sm"
                    : "text-stone-500 hover:text-stone-900"
                }`}
              >
                {option}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      {view === "map" && mappedCount > 0 ? (
        <PlanningMap applications={mappableApplications} />
      ) : (
        <PlanningApplicationList applications={items} />
      )}

      {searchError && items.length > 0 ? (
        <p className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950" role="status">
          Could not load more applications just now. Please try again.
        </p>
      ) : null}

      {hasMore && view === "list" ? (
        <div className="border-t border-stone-200 py-5 text-center">
          <button
            type="button"
            onClick={loadMore}
            disabled={loading}
            className="min-h-11 rounded-full border border-stone-300 bg-white px-5 text-sm font-semibold text-stone-800 transition hover:border-stone-500 disabled:cursor-wait disabled:opacity-60"
          >
            {loading ? "Loading…" : "Load 25 more applications"}
          </button>
        </div>
      ) : null}
    </div>
  )
}

function PlanningMap({ applications }: { applications: PlanningResultRecord[] }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<LeafletMap | null>(null)

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return
    let cancelled = false

    void import("leaflet").then((leaflet) => {
      if (cancelled || !containerRef.current) return

      const map = leaflet.map(containerRef.current, {
        scrollWheelZoom: false,
        minZoom: 6,
      })
      mapRef.current = map
      leaflet
        .tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
          attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
          maxZoom: 19,
        })
        .addTo(map)

      const bounds = leaflet.latLngBounds([])
      for (const application of applications) {
        if (!application.coordinates) continue
        const point = leaflet.latLng(application.coordinates.lat, application.coordinates.lng)
        bounds.extend(point)
        const marker = leaflet
          .circleMarker(point, {
            radius: 8,
            weight: 2,
            color: "#14532d",
            fillColor: "#16a34a",
            fillOpacity: 0.78,
          })
          .addTo(map)
        const popup = document.createElement("div")
        popup.className = "min-w-52"
        const reference = document.createElement("p")
        reference.className = "font-semibold"
        reference.textContent = application.reference
        popup.append(reference)
        if (application.location) {
          const location = document.createElement("p")
          location.className = "mt-1 text-sm"
          location.textContent = application.location
          popup.append(location)
        }
        if (application.detailHref) {
          const link = document.createElement("a")
          link.className = "mt-2 inline-block font-semibold underline"
          link.href = application.detailHref
          link.textContent = "View application"
          popup.append(link)
        }
        marker.bindPopup(popup)
      }

      if (bounds.isValid()) map.fitBounds(bounds, { padding: [28, 28], maxZoom: 14 })
      else map.setView([53.4, -8], 7)
    })

    return () => {
      cancelled = true
      mapRef.current?.remove()
      mapRef.current = null
    }
  }, [applications])

  return (
    <div className="py-5">
      <div
        ref={containerRef}
        className="h-[480px] w-full overflow-hidden rounded-xl border border-stone-200 bg-stone-100 sm:h-[560px]"
        aria-label="Map of planning application results"
      />
      <p className="mt-3 text-xs leading-5 text-stone-500">
        The map shows the results loaded above. Applications without reliable coordinates remain in the list.
      </p>
    </div>
  )
}
