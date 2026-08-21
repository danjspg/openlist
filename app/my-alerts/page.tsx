import type { Metadata } from "next"
import Link from "next/link"
import { redirect } from "next/navigation"
import { requireUser } from "@/lib/auth"
import {
  PLANNING_ALERT_EVENT_TYPES,
  PLANNING_ALERT_STATUS_DESTINATIONS,
} from "@/lib/planning-alert-delivery-rules"
import { getPlanningAuthorityByCode } from "@/lib/planning-authorities"
import type { PlanningEventType } from "@/lib/planning-events"
import {
  decisionDuePresentation,
  planningProposalSummary,
} from "@/lib/planning-presentation"
import { planningStatusLabel, type PlanningStatus } from "@/lib/planning-status"
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
  normalized_status: PlanningStatus
  decision_due_date: string | null
  decision_date: string | null
  final_grant_date: string | null
  appeal_decision_date: string | null
  withdrawal_date: string | null
}

type AlertRow = {
  id: string
  application_id: string
  enabled: boolean
  created_at: string
  planning_applications: AlertApplication | AlertApplication[] | null
}

type AlertEvent = {
  id: string
  application_id: string
  event_type: PlanningEventType
  event_date: string
  detected_at: string
  label: string
  new_value: string | null
}

const meaningfulAlertTypes = new Set<string>([
  ...PLANNING_ALERT_EVENT_TYPES,
  "status_changed",
])
const usefulStatusDestinations = new Set<string>(PLANNING_ALERT_STATUS_DESTINATIONS)

export default async function MyAlertsPage() {
  const currentUser = await requireUser().catch(() => null)
  if (!currentUser) redirect("/sign-in?redirectTo=%2Fmy-alerts")

  const supabase = getServerSupabase()
  const { data, error } = await supabase
    .from("planning_alert_subscriptions")
    .select("id,application_id,enabled,created_at,planning_applications(reference,local_authority,local_authority_code,proposal,location,normalized_status,decision_due_date,decision_date,final_grant_date,appeal_decision_date,withdrawal_date)")
    .eq("user_id", currentUser.id)
    .order("created_at", { ascending: false })

  const alerts = (data ?? []) as AlertRow[]
  const applicationIds = [...new Set(alerts.map((alert) => alert.application_id))]
  const earliestAlert = alerts.reduce<string | null>(
    (earliest, alert) => !earliest || alert.created_at < earliest ? alert.created_at : earliest,
    null
  )
  const eventResult = applicationIds.length > 0 && earliestAlert
    ? await supabase
        .from("planning_application_events")
        .select("id,application_id,event_type,event_date,detected_at,label,new_value")
        .in("application_id", applicationIds)
        .eq("provenance", "observed")
        .gte("detected_at", earliestAlert)
        .order("detected_at", { ascending: false })
        .limit(Math.min(1000, Math.max(100, applicationIds.length * 10)))
    : { data: [] as AlertEvent[], error: null }
  const events = (eventResult.data ?? []) as AlertEvent[]
  const eventsByApplication = new Map<string, AlertEvent[]>()
  for (const event of events) {
    const applicationEvents = eventsByApplication.get(event.application_id) ?? []
    applicationEvents.push(event)
    eventsByApplication.set(event.application_id, applicationEvents)
  }

  return (
    <main className="min-h-screen bg-stone-50">
      <section className="mx-auto max-w-4xl px-4 py-8 sm:px-6 sm:py-10">
        <header className="border-b border-stone-200 pb-6">
          <h1 className="text-3xl font-semibold tracking-tight text-stone-950">My alerts</h1>
          <p className="mt-2 text-sm leading-6 text-stone-600">
            Planning applications you&apos;re following
          </p>
        </header>

        {error ? (
          <div className="mt-6 rounded-2xl border border-red-200 bg-red-50 p-5 text-red-700">
            Database error: {error.message}
          </div>
        ) : alerts.length === 0 ? (
          <div className="mt-6 rounded-[24px] border border-stone-200 bg-white p-8 text-center text-stone-600 shadow-sm">
            You&apos;re not following any planning applications yet. Open an application and choose Get email updates.
          </div>
        ) : (
          <div className="mt-5 space-y-3">
            {alerts.map((alert) => (
              <AlertCard
                key={alert.id}
                alert={alert}
                events={eventsByApplication.get(alert.application_id) ?? []}
                activityAvailable={!eventResult.error}
              />
            ))}
          </div>
        )}
      </section>
    </main>
  )
}

function AlertCard({
  alert,
  events,
  activityAvailable,
}: {
  alert: AlertRow
  events: AlertEvent[]
  activityAvailable: boolean
}) {
  const application = Array.isArray(alert.planning_applications)
    ? alert.planning_applications[0] ?? null
    : alert.planning_applications
  const authority = application ? getPlanningAuthorityByCode(application.local_authority_code) : null
  const applicationPath = application && authority
    ? planningApplicationPath(authority, application.reference)
    : null
  const latestEvent = latestMeaningfulAlertEvent(events, alert.created_at)
  const decisionDue = application ? decisionDuePresentation(application) : null

  return (
    <article className="rounded-2xl border border-stone-200 bg-white px-5 py-5 shadow-sm sm:px-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          {application ? (
            <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
              <span className="font-mono font-semibold text-emerald-800">{application.reference}</span>
              <span aria-hidden="true" className="text-stone-300">·</span>
              <span className="font-semibold text-stone-700">{application.local_authority}</span>
            </p>
          ) : null}
          <h2 className="mt-2 line-clamp-2 text-lg font-semibold leading-6 tracking-tight text-stone-950">
            {application?.location || application?.reference || "Planning application"}
          </h2>
          {application?.proposal ? (
            <p className="mt-1.5 line-clamp-2 max-w-2xl text-sm leading-6 text-stone-600">
              {planningProposalSummary(application.proposal, "Proposal not recorded", 190)}
            </p>
          ) : null}
        </div>
        <p className={`shrink-0 text-xs font-medium ${alert.enabled ? "text-emerald-700" : "text-stone-500"}`}>
          <span className={`mr-1.5 inline-block size-1.5 rounded-full ${alert.enabled ? "bg-emerald-600" : "bg-stone-400"}`} />
          {alert.enabled ? "Email updates on" : "Email updates off"}
        </p>
      </div>

      <div className="mt-4 grid gap-3 border-y border-stone-100 py-3 sm:grid-cols-2">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-stone-500">Current status</p>
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            <span className="inline-flex rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-800 ring-1 ring-inset ring-emerald-200">
              {application ? planningStatusLabel(application.normalized_status) : "Status unavailable"}
            </span>
            {decisionDue ? (
              <span className="text-xs font-medium text-stone-600">
                Decision due {formatShortDate(decisionDue.date)}
              </span>
            ) : null}
          </div>
        </div>
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-stone-500">Recent activity</p>
          <p className={`mt-1.5 text-sm font-medium ${latestEvent ? "text-stone-900" : "text-stone-600"}`}>
            {latestEvent
              ? latestEvent.label
              : activityAvailable
                ? "No changes since this alert was created"
                : "Recent activity unavailable"}
          </p>
          {latestEvent ? (
            <p className="mt-0.5 text-xs text-stone-500">Updated {formatUpdateTime(latestEvent.detected_at)}</p>
          ) : null}
        </div>
      </div>

      <div className="mt-4 flex flex-col gap-2.5 sm:flex-row sm:flex-wrap sm:items-center">
        {applicationPath ? (
          <Link href={applicationPath} className="inline-flex min-h-10 items-center justify-center rounded-full bg-emerald-700 px-4 text-sm font-semibold text-white transition hover:bg-emerald-800">
            View application <span aria-hidden="true" className="ml-1.5">→</span>
          </Link>
        ) : null}
        {alert.enabled ? (
          <form action={disablePlanningAlert}>
            <input type="hidden" name="subscriptionId" value={alert.id} />
            <button type="submit" className="inline-flex min-h-10 w-full items-center justify-center rounded-full border border-stone-300 bg-white px-4 text-sm font-medium text-stone-700 transition hover:border-stone-400 hover:text-stone-950 sm:w-auto">
              Stop updates
            </button>
          </form>
        ) : (
          <form action={enablePlanningAlert}>
            <input type="hidden" name="applicationId" value={alert.application_id} />
            <button type="submit" className="inline-flex min-h-10 w-full items-center justify-center rounded-full border border-stone-300 bg-white px-4 text-sm font-medium text-stone-700 transition hover:border-stone-400 hover:text-stone-950 sm:w-auto">
              Restart updates
            </button>
          </form>
        )}
        <form action={deletePlanningAlert} className="sm:ml-auto">
          <input type="hidden" name="subscriptionId" value={alert.id} />
          <button type="submit" className="inline-flex min-h-10 w-full items-center justify-center px-2 text-xs font-medium text-stone-400 underline decoration-stone-300 underline-offset-4 transition hover:text-red-700 sm:w-auto">
            Remove alert
          </button>
        </form>
      </div>
    </article>
  )
}

function latestMeaningfulAlertEvent(events: AlertEvent[], createdAt: string) {
  return events
    .filter((event) => {
      if (event.detected_at < createdAt || !meaningfulAlertTypes.has(event.event_type)) return false
      return event.event_type !== "status_changed" || Boolean(
        event.new_value && usefulStatusDestinations.has(event.new_value)
      )
    })
    .sort((left, right) =>
      right.detected_at.localeCompare(left.detected_at) ||
      Number(left.event_type === "status_changed") - Number(right.event_type === "status_changed")
    )[0] ?? null
}

function formatShortDate(value: string) {
  const date = new Date(`${value}T00:00:00Z`)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat("en-IE", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(date)
}

function formatUpdateTime(value: string, now = new Date()) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "recently"
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  const updated = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
  const days = Math.round((today - updated) / 86_400_000)
  if (days === 0) return "today"
  if (days === 1) return "yesterday"
  if (days > 1 && days < 7) return `${days} days ago`
  return new Intl.DateTimeFormat("en-IE", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(date)
}
