"use client"

import Link from "next/link"
import { useEffect, useRef, useState } from "react"
import type { Map as LeafletMap } from "leaflet"

export type PlanningResultLifecycleEvent = {
  label: string
  date: string
  detail: string | null
}

export type PlanningResultRecord = {
  id: string
  reference: string
  registrationDate: string | null
  status: string | null
  proposal: string | null
  authority: string
  location: string | null
  applicant: string | null
  applicationType: string | null
  decision: string | null
  latestEvent: PlanningResultLifecycleEvent | null
  detailHref: string | null
  coordinates: { lat: number; lng: number } | null
}

export default function PlanningResultsView({
  applications,
}: {
  applications: PlanningResultRecord[]
}) {
  const mappableApplications = applications.filter(
    (application) => application.coordinates
  )
  const [view, setView] = useState<"list" | "map">("list")

  if (applications.length === 0) {
    return (
      <div className="py-12 text-center text-sm text-stone-500">
        No planning applications matched those filters.
      </div>
    )
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-4 border-b border-stone-200 py-3">
        <p className="text-sm text-stone-500">
          {mappableApplications.length > 0
            ? `${mappableApplications.length.toLocaleString("en-IE")} of ${applications.length.toLocaleString("en-IE")} applications shown have usable map coordinates.`
            : "These applications do not include usable map coordinates."}
        </p>
        <div
          className="inline-flex shrink-0 rounded-md border border-stone-200 bg-stone-50 p-1"
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
        <ApplicationsList applications={applications} />
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

function ApplicationsList({ applications }: { applications: PlanningResultRecord[] }) {
  return (
    <div className="divide-y divide-stone-200">
      {applications.map((application) => (
        <article
          key={application.id}
          className="grid gap-4 py-5 lg:grid-cols-[150px_minmax(0,1fr)]"
        >
          <div>
            <p className="font-mono text-sm font-semibold text-stone-950">
              {application.reference}
            </p>
            <p className="mt-2 text-sm text-stone-500">
              Registered {formatDate(application.registrationDate)}
            </p>
            {application.status ? (
              <p className="mt-3 inline-flex rounded-full border border-stone-200 px-3 py-1 text-xs font-semibold text-stone-600">
                Status: {application.status}
              </p>
            ) : null}
          </div>

          <div className="min-w-0">
            {application.latestEvent ? (
              <div className="mb-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-emerald-800">
                  {application.latestEvent.label} · {formatDate(application.latestEvent.date)}
                </p>
                {application.latestEvent.detail ? (
                  <p className="mt-1 text-sm font-semibold text-emerald-950">
                    {application.latestEvent.detail}
                  </p>
                ) : null}
              </div>
            ) : null}
            <h3 className="line-clamp-3 text-lg font-semibold leading-7 tracking-tight text-stone-950">
              {application.detailHref ? (
                <Link className="transition hover:text-emerald-800" href={application.detailHref}>
                  {application.proposal || "No proposal text recorded"}
                </Link>
              ) : (
                application.proposal || "No proposal text recorded"
              )}
            </h3>
            <p className="mt-2 text-sm font-semibold text-stone-500">
              {application.authority}
            </p>
            <p className="mt-2 text-sm leading-6 text-stone-600">
              {application.location || "No location recorded"}
            </p>
            <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-sm text-stone-500">
              {application.applicant ? <span>Applicant: {application.applicant}</span> : null}
              {application.applicationType ? (
                <span>Application type: {application.applicationType}</span>
              ) : null}
              {application.decision && application.latestEvent?.label !== "Decision" ? (
                <span>Decision: {application.decision}</span>
              ) : null}
            </div>
            {application.detailHref ? (
              <Link
                href={application.detailHref}
                className="mt-4 inline-flex text-sm font-semibold text-stone-700 transition hover:text-stone-950"
              >
                View application details <span aria-hidden="true" className="ml-1">→</span>
              </Link>
            ) : null}
          </div>
        </article>
      ))}
    </div>
  )
}

function formatDate(value: string | null) {
  if (!value) return "Not recorded"
  const date = new Date(`${value}T00:00:00`)
  if (Number.isNaN(date.getTime())) return "Not recorded"
  return new Intl.DateTimeFormat("en-IE", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date)
}