"use client"

import "leaflet/dist/leaflet.css"
import { useEffect, useRef, useState } from "react"
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
  const mappableApplications = applications.filter(
    (application) => application.coordinates
  )
  const [view, setView] = useState<"list" | "map">("list")
  const resultCount = applications.length
  const mappedCount = mappableApplications.length

  if (applications.length === 0) {
    return (
      <div className="py-12 text-center text-sm text-stone-500">
        No planning applications matched those filters.
      </div>
    )
  }

  return (
    <div>
      <div className="flex flex-col gap-3 border-b border-stone-200 py-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm font-medium text-stone-500">
          {resultCount.toLocaleString("en-IE")} {resultCount === 1 ? "result" : "results"}
          <span aria-hidden="true" className="mx-1.5 text-stone-300">·</span>
          {mappedCount > 0
            ? `${mappedCount.toLocaleString("en-IE")} mapped`
            : "No mapped results"}
        </p>
        <div
          className="inline-flex w-fit shrink-0 rounded-md border border-stone-200 bg-stone-50 p-1"
          aria-label="Planning results view"
        >
          {(["list", "map"] as const).map((option) => (
            <button
              key={option}
              type="button"
              disabled={option === "map" && mappableApplications.length === 0}
              onClick={() => setView(option)}
              className={`min-h-9 rounded px-3 text-sm font-semibold capitalize transition ${
                view === option
                  ? "bg-white text-stone-950 shadow-sm"
                  : "text-stone-500 hover:text-stone-900 disabled:cursor-not-allowed disabled:opacity-40"
              }`}
            >
              {option}
            </button>
          ))}
        </div>
      </div>

      {view === "map" && mappableApplications.length > 0 ? (
        <PlanningMap applications={mappableApplications} />
      ) : (
        <PlanningApplicationList applications={applications} />
      )}
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
          attribution:
            '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
          maxZoom: 19,
        })
        .addTo(map)

      const bounds = leaflet.latLngBounds([])
      for (const application of applications) {
        if (!application.coordinates) continue
        const point = leaflet.latLng(
          application.coordinates.lat,
          application.coordinates.lng
        )
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

      if (bounds.isValid()) {
        map.fitBounds(bounds, { padding: [28, 28], maxZoom: 14 })
      } else {
        map.setView([53.4, -8], 7)
      }
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
        className="h-[480px] w-full overflow-hidden rounded-lg border border-stone-200 bg-stone-100 sm:h-[560px]"
        aria-label="Map of planning application results"
      />
      <p className="mt-3 text-xs leading-5 text-stone-500">
        The map shows only the bounded result set above, not every application in the database.
        Applications without reliable coordinates remain available in the list.
      </p>
    </div>
  )
}
