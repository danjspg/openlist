"use client"

import "leaflet/dist/leaflet.css"
import { useEffect, useRef } from "react"
import type { Map as LeafletMap } from "leaflet"
import { PlanningAreaAlertControls } from "@/components/planning/PlanningAreaAlertControls"
import type { NearbyPlanningMapData } from "@/lib/planning-nearby"

export function NearbyPlanningMap({
  applicationId,
  applicationReference,
  data,
}: {
  applicationId: string
  applicationReference: string
  data: NearbyPlanningMapData
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<LeafletMap | null>(null)
  const radiusKm = data.radiusM / 1000
  const shown = data.applications.length

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return
    let cancelled = false

    void import("leaflet").then((leaflet) => {
      if (cancelled || !containerRef.current) return

      const center = leaflet.latLng(data.center.lat, data.center.lng)
      const map = leaflet.map(containerRef.current, {
        center,
        zoom: 13,
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

      const radius = leaflet
        .circle(center, {
          radius: data.radiusM,
          color: "#047857",
          fillColor: "#10b981",
          fillOpacity: 0.04,
          opacity: 0.35,
          weight: 1.5,
        })
        .addTo(map)

      const current = leaflet
        .circleMarker(center, {
          radius: 11,
          weight: 3,
          color: "#064e3b",
          fillColor: "#ffffff",
          fillOpacity: 1,
        })
        .addTo(map)

      const currentPopup = document.createElement("div")
      currentPopup.className = "min-w-48"
      const currentLabel = document.createElement("p")
      currentLabel.className = "text-xs font-semibold uppercase tracking-wide text-emerald-700"
      currentLabel.textContent = "This application"
      const currentRef = document.createElement("p")
      currentRef.className = "mt-1 font-semibold"
      currentRef.textContent = applicationReference
      currentPopup.append(currentLabel, currentRef)
      current.bindPopup(currentPopup)

      for (const application of data.applications) {
        if (!application.coordinates) continue
        const point = leaflet.latLng(application.coordinates.lat, application.coordinates.lng)
        const marker = leaflet
          .circleMarker(point, {
            radius: 7,
            weight: 2,
            color: "#14532d",
            fillColor: "#22c55e",
            fillOpacity: 0.75,
          })
          .addTo(map)

        const popup = document.createElement("div")
        popup.className = "min-w-56 max-w-72"

        const distance = document.createElement("p")
        distance.className = "text-xs font-semibold uppercase tracking-wide text-emerald-700"
        distance.textContent = formatDistance(application.distanceM)
        popup.append(distance)

        const reference = document.createElement("p")
        reference.className = "mt-1 font-semibold"
        reference.textContent = application.reference
        popup.append(reference)

        if (application.location) {
          const location = document.createElement("p")
          location.className = "mt-1 text-sm"
          location.textContent = application.location
          popup.append(location)
        }

        if (application.status) {
          const status = document.createElement("p")
          status.className = "mt-1 text-xs text-stone-500"
          status.textContent = application.status
          popup.append(status)
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

      map.fitBounds(radius.getBounds(), { padding: [24, 24] })
      window.setTimeout(() => map.invalidateSize(), 0)
    }).catch((error) => {
      console.error("Nearby planning map failed to initialise.", error)
    })

    return () => {
      cancelled = true
      mapRef.current?.remove()
      mapRef.current = null
    }
  }, [applicationReference, data])

  return (
    <section className="overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm">
      <div className="p-6 sm:p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-800">Location context</p>
        <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight text-stone-950">What&apos;s happening nearby?</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-stone-600">
              {shown > 0
                ? `${shown} nearby planning ${shown === 1 ? "application" : "applications"} shown within ${radiusKm.toFixed(radiusKm % 1 === 0 ? 0 : 1)} km.`
                : `No other mapped planning applications were found within ${radiusKm.toFixed(radiusKm % 1 === 0 ? 0 : 1)} km.`}
            </p>
          </div>
          <div className="flex items-center gap-2 text-xs font-medium text-stone-500">
            <span className="inline-block h-3 w-3 rounded-full border-[3px] border-emerald-900 bg-white" />
            This application
            <span className="ml-2 inline-block h-3 w-3 rounded-full border-2 border-green-900 bg-green-500" />
            Nearby
          </div>
        </div>
      </div>
      <div
        ref={containerRef}
        className="h-[520px] w-full bg-stone-100 sm:h-[620px]"
        aria-label={`Nearby planning applications around ${applicationReference}`}
      />
      <PlanningAreaAlertControls applicationId={applicationId} />
      <div className="border-t border-stone-200 bg-stone-50 px-6 py-3 text-xs leading-5 text-stone-500 sm:px-8">
        Shows up to the 40 closest mapped applications within the radius. Locations are approximate and based on published planning coordinates.
      </div>
    </section>
  )
}

function formatDistance(distanceM: number) {
  if (distanceM < 1_000) return `${Math.max(1, Math.round(distanceM))} m away`
  return `${(distanceM / 1_000).toFixed(1)} km away`
}
