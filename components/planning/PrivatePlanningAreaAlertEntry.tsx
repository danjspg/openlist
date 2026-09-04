"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { createPortal } from "react-dom"
import { useEffect, useMemo, useState, useTransition } from "react"
import { useAuthState } from "@/components/AuthStateProvider"
import { createPlanningLocalityAreaAlert } from "@/app/my-alerts/area-actions"
import {
  PLANNING_AREA_ALERT_CATEGORIES,
  PLANNING_AREA_ALERT_RADII,
  planningAreaAlertRadiusLabel,
} from "@/lib/planning-area-alerts"

function titleCaseSlug(value: string) {
  return value
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ")
}

export function PrivatePlanningAreaAlertEntry() {
  const pathname = usePathname()
  const { isAuthenticated, isResolved } = useAuthState()
  const [host, setHost] = useState<HTMLElement | null>(null)

  const route = useMemo(() => {
    const locality = pathname.match(/^\/planning\/([^/]+)\/areas\/([^/]+)\/?$/)
    if (locality) return { kind: "locality" as const, authoritySlug: locality[1], localitySlug: locality[2] }
    const category = pathname.match(/^\/planning\/categories\/([^/]+)\/?$/)
    if (category) return { kind: "category" as const, categorySlug: category[1] }
    return null
  }, [pathname])

  useEffect(() => {
    if (!isResolved || !isAuthenticated || !route) return
    const anchor = route.kind === "locality"
      ? document.querySelector("main > section > header")
      : document.querySelector("main > section:first-child")
    if (!(anchor instanceof HTMLElement)) return

    const container = document.createElement("div")
    container.dataset.privatePlanningAreaAlert = "true"
    anchor.insertAdjacentElement("afterend", container)
    const frame = window.requestAnimationFrame(() => setHost(container))

    return () => {
      window.cancelAnimationFrame(frame)
      container.remove()
    }
  }, [isAuthenticated, isResolved, route])

  if (!isResolved || !isAuthenticated || !route || !host || !host.isConnected) return null

  return createPortal(
    route.kind === "locality" ? (
      <LocalityAlertPanel authoritySlug={route.authoritySlug} localitySlug={route.localitySlug} />
    ) : (
      <CategoryAlertPanel categorySlug={route.categorySlug} />
    ),
    host
  )
}

function LocalityAlertPanel({ authoritySlug, localitySlug }: { authoritySlug: string; localitySlug: string }) {
  const [radiusM, setRadiusM] = useState(2000)
  const [category, setCategory] = useState("residential-development")
  const [message, setMessage] = useState("")
  const [error, setError] = useState("")
  const [isPending, startTransition] = useTransition()
  const localityLabel = titleCaseSlug(localitySlug)

  function createAlert() {
    setMessage("")
    setError("")
    const formData = new FormData()
    formData.set("authoritySlug", authoritySlug)
    formData.set("localitySlug", localitySlug)
    formData.set("radiusM", String(radiusM))
    formData.set("category", category)

    startTransition(async () => {
      try {
        const result = await createPlanningLocalityAreaAlert(formData)
        setMessage(result.created ? "Local planning alert created." : "This local planning alert is active.")
      } catch (actionError) {
        setError(actionError instanceof Error ? actionError.message : "Could not create this locality alert.")
      }
    })
  }

  return (
    <section className="mt-6 rounded-2xl border border-emerald-200 bg-emerald-50/70 p-5 shadow-sm sm:p-6" aria-label={`Planning alerts for ${localityLabel}`}>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-2xl">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-800">Private beta</p>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight text-stone-950">Get planning alerts for {localityLabel}</h2>
          <p className="mt-2 text-sm leading-6 text-stone-600">
            OpenList uses a robust mapped centre derived from local planning records. Alerts are for newly submitted applications only.
          </p>
        </div>
        <Link href="/my-alerts/areas" className="text-sm font-semibold text-emerald-900 hover:underline">
          Manage area alerts →
        </Link>
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-[minmax(0,1.5fr)_180px_auto] md:items-end">
        <label className="text-sm font-medium text-stone-700">
          Tell me about
          <select
            value={category}
            onChange={(event) => setCategory(event.target.value)}
            className="mt-1.5 min-h-11 w-full rounded-xl border border-stone-300 bg-white px-3 text-sm text-stone-900 shadow-sm"
          >
            {PLANNING_AREA_ALERT_CATEGORIES.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </label>

        <label className="text-sm font-medium text-stone-700">
          Within
          <select
            value={radiusM}
            onChange={(event) => setRadiusM(Number(event.target.value))}
            className="mt-1.5 min-h-11 w-full rounded-xl border border-stone-300 bg-white px-3 text-sm text-stone-900 shadow-sm"
          >
            {PLANNING_AREA_ALERT_RADII.map((radius) => (
              <option key={radius} value={radius}>{planningAreaAlertRadiusLabel(radius)}</option>
            ))}
          </select>
        </label>

        <button
          type="button"
          onClick={createAlert}
          disabled={isPending}
          className="inline-flex min-h-11 items-center justify-center rounded-xl bg-emerald-700 px-5 text-sm font-semibold text-white transition hover:bg-emerald-800 disabled:cursor-wait disabled:opacity-60"
        >
          {isPending ? "Creating…" : "Create alert"}
        </button>
      </div>

      {message ? <p className="mt-3 text-sm font-medium text-emerald-800">{message}</p> : null}
      {error ? <p className="mt-3 text-sm font-medium text-red-700">{error}</p> : null}
    </section>
  )
}

function CategoryAlertPanel({ categorySlug }: { categorySlug: string }) {
  const category = PLANNING_AREA_ALERT_CATEGORIES.find((item) => item.value === categorySlug)
  const label = category?.label ?? titleCaseSlug(categorySlug)

  return (
    <div className="mx-auto max-w-6xl px-4 pt-6 sm:px-6">
      <section className="rounded-2xl border border-emerald-200 bg-emerald-50/70 p-5 shadow-sm sm:p-6">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-800">Private beta</p>
        <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-xl font-semibold tracking-tight text-stone-950">Get local alerts for {label.toLowerCase()}</h2>
            <p className="mt-2 text-sm leading-6 text-stone-600">
              Choose a planning area first. On its locality page you can create a new-application alert using the mapped centre for that area.
            </p>
          </div>
          <Link href="/planning/areas" className="inline-flex min-h-11 items-center justify-center rounded-xl bg-emerald-700 px-5 text-sm font-semibold text-white hover:bg-emerald-800">
            Choose an area
          </Link>
        </div>
      </section>
    </div>
  )
}
