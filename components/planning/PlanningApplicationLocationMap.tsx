"use client"

import { createPortal } from "react-dom"
import { useEffect, useMemo, useRef, useState } from "react"

type Coordinates = { lat: number; lng: number }

type Props = {
  authority: string
  reference: string
  applicationReference: string
}

export function PlanningApplicationLocationMap({ authority, reference, applicationReference }: Props) {
  const sentinelRef = useRef<HTMLDivElement>(null)
  const [host, setHost] = useState<HTMLDivElement | null>(null)
  const [coordinates, setCoordinates] = useState<Coordinates | null>(null)
  const [resolved, setResolved] = useState(false)
  const [shouldLoad, setShouldLoad] = useState(false)

  useEffect(() => {
    const timelineHeading = document.getElementById("planning-timeline-heading")
    const timeline = timelineHeading?.closest("section")
    if (!timeline?.parentElement) return

    const portalHost = document.createElement("div")
    timeline.insertAdjacentElement("afterend", portalHost)
    setHost(portalHost)

    return () => portalHost.remove()
  }, [])

  useEffect(() => {
    if (!host || !sentinelRef.current || shouldLoad) return

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return
        setShouldLoad(true)
        observer.disconnect()
      },
      { rootMargin: "500px 0px" }
    )

    observer.observe(sentinelRef.current)
    return () => observer.disconnect()
  }, [host, shouldLoad])

  useEffect(() => {
    if (!shouldLoad) return
    const controller = new AbortController()

    void fetch(
      `/api/planning/application-location?authority=${encodeURIComponent(authority)}&reference=${encodeURIComponent(reference)}`,
      { signal: controller.signal }
    )
      .then(async (response) => {
        if (!response.ok) return null
        const payload = (await response.json()) as { coordinates?: Coordinates | null }
        return payload.coordinates ?? null
      })
      .then((value) => {
        setCoordinates(value)
        setResolved(true)
      })
      .catch((error) => {
        if (error instanceof DOMException && error.name === "AbortError") return
        setResolved(true)
      })

    return () => controller.abort()
  }, [authority, reference, shouldLoad])

  const mapUrl = useMemo(() => {
    if (!coordinates) return null
    const radius = 0.012
    const bbox = [
      coordinates.lng - radius,
      coordinates.lat - radius,
      coordinates.lng + radius,
      coordinates.lat + radius,
    ].join(",")
    return `https://www.openstreetmap.org/export/embed.html?bbox=${encodeURIComponent(bbox)}&layer=mapnik&marker=${encodeURIComponent(`${coordinates.lat},${coordinates.lng}`)}`
  }, [coordinates])

  if (!host || (resolved && !coordinates)) return null

  return createPortal(
    <div ref={sentinelRef}>
      {mapUrl ? (
        <section className="overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm">
          <div className="p-6 sm:p-8">
            <h2 className="text-2xl font-semibold tracking-tight text-stone-950">Application location</h2>
            <p className="mt-2 text-sm leading-6 text-stone-600">
              Approximate map position from coordinates supplied with the planning record.
            </p>
          </div>
          <iframe
            title={`Map for planning application ${applicationReference}`}
            loading="lazy"
            className="h-[360px] w-full border-0"
            src={mapUrl}
          />
        </section>
      ) : null}
    </div>,
    host
  )
}
