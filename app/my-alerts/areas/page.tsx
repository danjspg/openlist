import type { Metadata } from "next"
import Link from "next/link"
import { redirect } from "next/navigation"
import { requireUser } from "@/lib/auth"
import {
  planningAreaAlertCategoryLabel,
  planningAreaAlertRadiusLabel,
  planningAreaAlertTriggerLabel,
  type PlanningAreaAlertSubscription,
} from "@/lib/planning-area-alerts"
import { getPlanningAuthorityByCode } from "@/lib/planning-authorities"
import { planningApplicationPath } from "@/lib/property-intelligence"
import { getServerSupabase } from "@/lib/supabase"
import {
  deletePlanningAreaAlert,
  disablePlanningAreaAlert,
  enablePlanningAreaAlert,
} from "../area-actions"

export const metadata: Metadata = {
  title: "Area Alerts | OpenList",
  robots: { index: false, follow: false },
}

type SourceApplication = {
  reference: string
  local_authority_code: string
}

type AreaAlertRow = PlanningAreaAlertSubscription & {
  planning_applications: SourceApplication | SourceApplication[] | null
}

export default async function PlanningAreaAlertsPage() {
  const currentUser = await requireUser().catch(() => null)
  if (!currentUser) redirect("/sign-in?redirectTo=%2Fmy-alerts%2Fareas")

  const { data, error } = await getServerSupabase()
    .from("planning_area_alert_subscriptions")
    .select("id,user_id,source_application_id,label,center_lat,center_lng,radius_m,category,event_trigger,enabled,created_at,updated_at,planning_applications(reference,local_authority_code)")
    .eq("user_id", currentUser.id)
    .order("created_at", { ascending: false })

  const alerts = (data ?? []) as AreaAlertRow[]

  return (
    <main className="min-h-screen bg-stone-50">
      <section className="mx-auto max-w-4xl px-4 py-8 sm:px-6 sm:py-10">
        <header className="border-b border-stone-200 pb-6">
          <Link href="/my-alerts" className="text-sm font-semibold text-emerald-800 hover:text-emerald-950">← My alerts</Link>
          <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-800">Private beta</p>
              <h1 className="mt-1 text-3xl font-semibold tracking-tight text-stone-950">Area alerts</h1>
              <p className="mt-2 text-sm leading-6 text-stone-600">Planning activity you&apos;re monitoring around mapped locations.</p>
            </div>
          </div>
        </header>

        {error ? (
          <div className="mt-6 rounded-2xl border border-red-200 bg-red-50 p-5 text-red-700">Database error: {error.message}</div>
        ) : alerts.length === 0 ? (
          <div className="mt-6 rounded-[24px] border border-stone-200 bg-white p-8 text-center text-stone-600 shadow-sm">
            No area alerts yet. Open a mapped planning application and use the alert controls below the nearby map.
          </div>
        ) : (
          <div className="mt-5 space-y-3">
            {alerts.map((alert) => <AreaAlertCard key={alert.id} alert={alert} />)}
          </div>
        )}
      </section>
    </main>
  )
}

function AreaAlertCard({ alert }: { alert: AreaAlertRow }) {
  const source = Array.isArray(alert.planning_applications)
    ? alert.planning_applications[0] ?? null
    : alert.planning_applications
  const authority = source ? getPlanningAuthorityByCode(source.local_authority_code) : null
  const sourcePath = source && authority ? planningApplicationPath(authority, source.reference) : null

  return (
    <article className="rounded-2xl border border-stone-200 bg-white px-5 py-5 shadow-sm sm:px-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-emerald-800">{planningAreaAlertCategoryLabel(alert.category)}</p>
          <h2 className="mt-2 line-clamp-2 text-lg font-semibold leading-6 tracking-tight text-stone-950">{alert.label}</h2>
          <p className="mt-1.5 text-sm leading-6 text-stone-600">
            {planningAreaAlertTriggerLabel(alert.event_trigger)} · within {planningAreaAlertRadiusLabel(alert.radius_m)}
          </p>
        </div>
        <p className={`shrink-0 text-xs font-medium ${alert.enabled ? "text-emerald-700" : "text-stone-500"}`}>
          <span className={`mr-1.5 inline-block size-1.5 rounded-full ${alert.enabled ? "bg-emerald-600" : "bg-stone-400"}`} />
          {alert.enabled ? "Email updates on" : "Email updates off"}
        </p>
      </div>

      <div className="mt-4 flex flex-col gap-2.5 border-t border-stone-100 pt-4 sm:flex-row sm:flex-wrap sm:items-center">
        {sourcePath ? (
          <Link href={sourcePath} className="inline-flex min-h-10 items-center justify-center rounded-full bg-emerald-700 px-4 text-sm font-semibold text-white transition hover:bg-emerald-800">
            View alert location <span aria-hidden="true" className="ml-1.5">→</span>
          </Link>
        ) : null}
        {alert.enabled ? (
          <form action={disablePlanningAreaAlert}>
            <input type="hidden" name="subscriptionId" value={alert.id} />
            <button type="submit" className="inline-flex min-h-10 w-full items-center justify-center rounded-full border border-stone-300 bg-white px-4 text-sm font-medium text-stone-700 transition hover:border-stone-400 hover:text-stone-950 sm:w-auto">Stop updates</button>
          </form>
        ) : (
          <form action={enablePlanningAreaAlert}>
            <input type="hidden" name="subscriptionId" value={alert.id} />
            <button type="submit" className="inline-flex min-h-10 w-full items-center justify-center rounded-full border border-stone-300 bg-white px-4 text-sm font-medium text-stone-700 transition hover:border-stone-400 hover:text-stone-950 sm:w-auto">Restart updates</button>
          </form>
        )}
        {!alert.enabled ? (
          <form action={deletePlanningAreaAlert} className="sm:ml-auto">
            <input type="hidden" name="subscriptionId" value={alert.id} />
            <button type="submit" className="inline-flex min-h-10 w-full items-center justify-center px-2 text-xs font-medium text-stone-400 underline decoration-stone-300 underline-offset-4 transition hover:text-red-700 sm:w-auto">Remove alert</button>
          </form>
        ) : null}
      </div>
    </article>
  )
}
