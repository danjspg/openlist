"use client"

import Link from "next/link"
import { useState, useTransition } from "react"
import { useAuthState } from "@/components/AuthStateProvider"
import { createPlanningAreaAlert } from "@/app/my-alerts/area-actions"
import {
  PLANNING_AREA_ALERT_CATEGORIES,
  PLANNING_AREA_ALERT_RADII,
  PLANNING_AREA_ALERT_TRIGGERS,
  planningAreaAlertRadiusLabel,
} from "@/lib/planning-area-alerts"

export function PlanningAreaAlertControls({
  applicationId,
}: {
  applicationId: string
}) {
  const { isAuthenticated, isResolved } = useAuthState()
  const [radiusM, setRadiusM] = useState(2000)
  const [category, setCategory] = useState("residential-development")
  const [eventTrigger, setEventTrigger] = useState("new")
  const [message, setMessage] = useState("")
  const [error, setError] = useState("")
  const [isPending, startTransition] = useTransition()

  if (!isResolved || !isAuthenticated) return null

  function createAlert() {
    setMessage("")
    setError("")
    const formData = new FormData()
    formData.set("sourceApplicationId", applicationId)
    formData.set("radiusM", String(radiusM))
    formData.set("category", category)
    formData.set("eventTrigger", eventTrigger)

    startTransition(async () => {
      try {
        const result = await createPlanningAreaAlert(formData)
        setMessage(result.created ? "Area alert created." : "Area alert is active.")
      } catch (actionError) {
        setError(actionError instanceof Error ? actionError.message : "Could not create this area alert.")
      }
    })
  }

  return (
    <div className="border-t border-stone-200 bg-emerald-50/60 px-6 py-5 sm:px-8">
      <div className="flex flex-col gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-emerald-800">Private beta</p>
          <h3 className="mt-1 text-lg font-semibold tracking-tight text-stone-950">Alert me about planning near here</h3>
          <p className="mt-1 text-sm leading-6 text-stone-600">
            Follow new applications or important lifecycle changes around this exact map location.
          </p>
        </div>

        <div className="grid gap-3 md:grid-cols-[minmax(0,1.3fr)_minmax(0,1.1fr)_160px]">
          <label className="text-sm font-medium text-stone-700">
            Development
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
            Tell me when
            <select
              value={eventTrigger}
              onChange={(event) => setEventTrigger(event.target.value)}
              className="mt-1.5 min-h-11 w-full rounded-xl border border-stone-300 bg-white px-3 text-sm text-stone-900 shadow-sm"
            >
              {PLANNING_AREA_ALERT_TRIGGERS.map((option) => (
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
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <button
            type="button"
            onClick={createAlert}
            disabled={isPending}
            className="inline-flex min-h-11 items-center justify-center rounded-xl bg-emerald-700 px-5 text-sm font-semibold text-white transition hover:bg-emerald-800 disabled:cursor-wait disabled:opacity-60"
          >
            {isPending ? "Creating alert…" : "Create area alert"}
          </button>
          {message ? (
            <p className="text-sm font-medium text-emerald-800">
              {message} <Link href="/my-alerts" className="underline underline-offset-4">Manage alerts</Link>
            </p>
          ) : null}
          {error ? <p className="text-sm font-medium text-red-700">{error}</p> : null}
        </div>
      </div>
    </div>
  )
}
