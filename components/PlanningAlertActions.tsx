"use client"

import Link from "next/link"
import { useCallback, useEffect, useState, useSyncExternalStore, useTransition } from "react"
import { useAuthState } from "@/components/AuthStateProvider"
import type { PlanningAlertSubscription } from "@/lib/planning-alerts"
import {
  disablePlanningAlert,
  enablePlanningAlert,
} from "@/app/my-alerts/actions"

type Props = {
  applicationId: string
  returnPath: string
  councilUrl: string | null
}

const alertButtonClass =
  "group inline-flex min-h-12 w-full items-center justify-center gap-2.5 rounded-xl border border-emerald-800/20 bg-gradient-to-b from-emerald-600 to-emerald-700 px-4 text-center text-sm font-semibold text-white shadow-sm shadow-emerald-950/10 ring-1 ring-inset ring-white/10 transition duration-200 hover:-translate-y-0.5 hover:from-emerald-500 hover:to-emerald-700 hover:shadow-md hover:shadow-emerald-950/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2 active:translate-y-0 active:shadow-sm disabled:pointer-events-none disabled:opacity-60"

function MailSparkIcon() {
  return (
    <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-white/12 ring-1 ring-inset ring-white/15 transition group-hover:bg-white/16" aria-hidden="true">
      <svg viewBox="0 0 24 24" fill="none" className="size-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 6.75h16v10.5H4z" />
        <path d="m4.5 7.5 7.5 5.25 7.5-5.25" />
        <path d="M17.75 3.5v2.25M16.625 4.625h2.25" />
      </svg>
    </span>
  )
}

function AlertButtonContents() {
  return (
    <>
      <MailSparkIcon />
      <span className="leading-tight">Get email updates</span>
      <svg viewBox="0 0 20 20" fill="none" className="size-4 shrink-0 opacity-75 transition-transform duration-200 group-hover:translate-x-0.5 group-hover:opacity-100" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="m7.5 5 5 5-5 5" />
      </svg>
    </>
  )
}

export function PlanningAlertActions(props: Props) {
  if (process.env.NEXT_PUBLIC_PLANNING_EMAIL_ALERTS_ENABLED !== "true") {
    return <CouncilOnlyAction councilUrl={props.councilUrl} />
  }

  return <EnabledPlanningAlertActions {...props} />
}

function CouncilOnlyAction({ councilUrl }: { councilUrl: string | null }) {
  return (
    <div data-planning-lifecycle-actions className="mt-5">
      {councilUrl ? (
        <a
          href={councilUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex min-h-11 w-full items-center justify-center rounded-lg border border-stone-300 bg-white px-4 text-center text-sm font-semibold text-stone-700 transition hover:border-stone-500 hover:text-stone-950"
        >
          View official council application
        </a>
      ) : (
        <p className="text-sm leading-6 text-stone-500">
          An official council link is not available for this recorded application.
        </p>
      )}
    </div>
  )
}

function EnabledPlanningAlertActions({ applicationId, returnPath, councilUrl }: Props) {
  const { isAuthenticated, isResolved } = useAuthState()
  const [subscription, setSubscription] = useState<PlanningAlertSubscription | null>(null)
  const [error, setError] = useState("")
  const [isPending, startTransition] = useTransition()
  const signInHref = `/sign-in?redirectTo=${encodeURIComponent(`${returnPath}?alert=1`)}`
  const alertIntent = useSyncExternalStore(
    () => () => {},
    () => new URLSearchParams(window.location.search).get("alert") === "1",
    () => false
  )

  const loadSubscription = useCallback(async () => {
    if (!isAuthenticated) {
      setSubscription(null)
      return
    }

    const response = await fetch(`/api/planning-alerts/${applicationId}`, {
      cache: "no-store",
      credentials: "same-origin",
    })
    if (!response.ok) throw new Error("Could not load your alert.")
    const payload = (await response.json()) as { subscription: PlanningAlertSubscription | null }
    setSubscription(payload.subscription)
  }, [applicationId, isAuthenticated])

  useEffect(() => {
    if (!isResolved || !isAuthenticated) return
    let active = true

    fetch(`/api/planning-alerts/${applicationId}`, {
      cache: "no-store",
      credentials: "same-origin",
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("Could not load your alert.")
        return response.json() as Promise<{ subscription: PlanningAlertSubscription | null }>
      })
      .then((payload) => {
        if (active) setSubscription(payload.subscription)
      })
      .catch((loadError) => {
        if (active) setError(loadError instanceof Error ? loadError.message : "Could not load your alert.")
      })

    return () => {
      active = false
    }
  }, [applicationId, isAuthenticated, isResolved])

  function handleEnable(formData: FormData) {
    setError("")
    startTransition(async () => {
      try {
        await enablePlanningAlert(formData)
        await loadSubscription()
      } catch (actionError) {
        setError(actionError instanceof Error ? actionError.message : "Could not start email updates.")
      }
    })
  }

  function handleDisable(formData: FormData) {
    setError("")
    startTransition(async () => {
      try {
        await disablePlanningAlert(formData)
        await loadSubscription()
      } catch (actionError) {
        setError(actionError instanceof Error ? actionError.message : "Could not stop email updates.")
      }
    })
  }

  return (
    <div data-planning-lifecycle-actions className="mt-5">
      {subscription?.enabled ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
          <p className="text-sm font-semibold text-emerald-900">Email updates are on</p>
          <p className="mt-1 text-xs leading-5 text-emerald-800">
            We&apos;ll email you about meaningful changes to this application.
          </p>
          <form action={handleDisable} className="mt-3">
            <input type="hidden" name="subscriptionId" value={subscription.id} />
            <input type="hidden" name="returnPath" value={returnPath} />
            <button type="submit" disabled={isPending} className="text-sm font-semibold text-emerald-900 underline underline-offset-4 hover:text-emerald-700 disabled:opacity-60">
              Stop email updates
            </button>
          </form>
        </div>
      ) : null}

      {!subscription?.enabled ? (
        <div>
          {alertIntent && isAuthenticated ? (
            <p className="mb-3 text-sm font-medium text-emerald-800">
              You&apos;re signed in. Confirm to start updates for this application.
            </p>
          ) : null}
          <div className="grid gap-3 sm:grid-cols-2">
            {isAuthenticated ? (
              <form action={handleEnable}>
                <input type="hidden" name="applicationId" value={applicationId} />
                <input type="hidden" name="returnPath" value={returnPath} />
                <button type="submit" disabled={isPending} className={alertButtonClass}>
                  <AlertButtonContents />
                </button>
              </form>
            ) : (
              <Link href={signInHref} className={alertButtonClass}>
                <AlertButtonContents />
              </Link>
            )}
            {councilUrl ? (
              <a href={councilUrl} target="_blank" rel="noreferrer" className="inline-flex min-h-12 w-full items-center justify-center rounded-xl border border-stone-300 bg-white px-4 text-center text-sm font-semibold text-stone-700 shadow-sm transition duration-200 hover:-translate-y-0.5 hover:border-stone-400 hover:text-stone-950 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stone-400 focus-visible:ring-offset-2 active:translate-y-0 active:shadow-sm">
                View official council application
              </a>
            ) : null}
          </div>
        </div>
      ) : null}

      {subscription?.enabled && councilUrl ? (
        <a href={councilUrl} target="_blank" rel="noreferrer" className="mt-3 inline-flex min-h-11 w-full items-center justify-center rounded-lg border border-stone-300 bg-white px-4 text-center text-sm font-semibold text-stone-700 transition hover:border-stone-500 hover:text-stone-950">
          View official council application
        </a>
      ) : !subscription?.enabled && !councilUrl ? (
        <p className="mt-4 text-sm leading-6 text-stone-500">
          An official council link is not available for this recorded application.
        </p>
      ) : null}

      {subscription?.enabled ? (
        <Link href="/my-alerts" className="mt-3 inline-flex text-sm font-medium text-stone-600 underline underline-offset-4 hover:text-stone-950">
          Manage my alerts
        </Link>
      ) : null}
      {error ? <p className="mt-3 text-sm text-red-700">{error}</p> : null}
    </div>
  )
}
