import type { Metadata } from "next"
import Link from "next/link"
import { redirect } from "next/navigation"
import { requireUser } from "@/lib/auth"
import { getPlanningAuthorityByCode } from "@/lib/planning-authorities"
import { planningApplicationPath } from "@/lib/property-intelligence"
import { getServerSupabase } from "@/lib/supabase"
import {
  deletePlanningAlert,
  disablePlanningAlert,
  enablePlanningAlert,
} from "./actions"

export const metadata: Metadata = {
  title: "My Alerts | OpenList",
  robots: { index: false, follow: false },
}

type AlertApplication = {
    reference: string
    local_authority: string
    local_authority_code: string
    proposal: string | null
    location: string | null
}

type AlertRow = {
  id: string
  application_id: string
  enabled: boolean
  created_at: string
  planning_applications: AlertApplication | AlertApplication[] | null
}

export default async function MyAlertsPage() {
  const currentUser = await requireUser().catch(() => null)
  if (!currentUser) redirect("/sign-in?redirectTo=%2Fmy-alerts")

  const { data, error } = await getServerSupabase()
    .from("planning_alert_subscriptions")
    .select("id,application_id,enabled,created_at,planning_applications(reference,local_authority,local_authority_code,proposal,location)")
    .eq("user_id", currentUser.id)
    .order("created_at", { ascending: false })

  const alerts = (data ?? []) as AlertRow[]

  return (
    <main className="min-h-screen bg-stone-50">
      <section className="mx-auto max-w-4xl px-4 py-10 sm:px-6 sm:py-12">
        <div className="rounded-[32px] border border-stone-200 bg-white p-6 shadow-sm sm:p-8">
          <p className="text-sm font-medium uppercase tracking-[0.24em] text-stone-500">OpenList</p>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight text-stone-900 sm:text-5xl">My alerts</h1>
          <p className="mt-4 max-w-2xl text-base leading-7 text-stone-600">
            Follow meaningful supported lifecycle changes for planning applications you&apos;re interested in.
          </p>
        </div>

        {error ? (
          <div className="mt-6 rounded-2xl border border-red-200 bg-red-50 p-5 text-red-700">
            Database error: {error.message}
          </div>
        ) : alerts.length === 0 ? (
          <div className="mt-6 rounded-[24px] border border-stone-200 bg-white p-8 text-center text-stone-600 shadow-sm">
            You&apos;re not following any planning applications yet. Open an application and choose Get email updates.
          </div>
        ) : (
          <div className="mt-6 space-y-4">
            {alerts.map((alert) => <AlertCard key={alert.id} alert={alert} />)}
          </div>
        )}
      </section>
    </main>
  )
}

function AlertCard({ alert }: { alert: AlertRow }) {
  const application = Array.isArray(alert.planning_applications)
    ? alert.planning_applications[0] ?? null
    : alert.planning_applications
  const authority = application ? getPlanningAuthorityByCode(application.local_authority_code) : null
  const applicationPath = application && authority
    ? planningApplicationPath(authority, application.reference)
    : null

  return (
    <article className="rounded-[24px] border border-stone-200 bg-white p-5 shadow-sm sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ring-1 ${alert.enabled ? "bg-emerald-50 text-emerald-800 ring-emerald-200" : "bg-stone-100 text-stone-600 ring-stone-200"}`}>
            {alert.enabled ? "Email updates on" : "Updates stopped"}
          </span>
          <h2 className="mt-3 text-xl font-semibold tracking-tight text-stone-900">
            {application?.proposal || application?.reference || "Planning application"}
          </h2>
          {application ? <p className="mt-2 text-sm text-stone-600">{application.local_authority} · {application.reference}</p> : null}
          {application?.location ? <p className="mt-1 text-sm text-stone-500">{application.location}</p> : null}
        </div>
      </div>

      <div className="mt-5 flex flex-wrap gap-3">
        {applicationPath ? (
          <Link href={applicationPath} className="inline-flex min-h-11 items-center rounded-full border border-stone-300 bg-white px-4 text-sm font-medium text-stone-700 transition hover:border-stone-500 hover:text-stone-950">
            View application
          </Link>
        ) : null}
        {alert.enabled ? (
          <form action={disablePlanningAlert}>
            <input type="hidden" name="subscriptionId" value={alert.id} />
            <button type="submit" className="inline-flex min-h-11 items-center rounded-full border border-stone-300 bg-white px-4 text-sm font-medium text-stone-700 transition hover:border-stone-500 hover:text-stone-950">
              Stop updates
            </button>
          </form>
        ) : (
          <form action={enablePlanningAlert}>
            <input type="hidden" name="applicationId" value={alert.application_id} />
            <button type="submit" className="inline-flex min-h-11 items-center rounded-full bg-emerald-700 px-4 text-sm font-medium text-white transition hover:bg-emerald-800">
              Restart updates
            </button>
          </form>
        )}
        <form action={deletePlanningAlert}>
          <input type="hidden" name="subscriptionId" value={alert.id} />
          <button type="submit" className="inline-flex min-h-11 items-center rounded-full px-4 text-sm font-medium text-stone-500 underline underline-offset-4 transition hover:text-stone-900">
            Delete alert
          </button>
        </form>
      </div>
    </article>
  )
}
