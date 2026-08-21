import type { Metadata } from "next"
import Link from "next/link"
import { unsubscribePlanningAlert } from "./actions"
import { verifyPlanningAlertUnsubscribeToken } from "@/lib/planning-alert-unsubscribe"

export const metadata: Metadata = {
  title: "Stop planning updates | OpenList",
  robots: { index: false, follow: false },
}

export const dynamic = "force-dynamic"

type Props = {
  searchParams: Promise<{ token?: string; status?: string }>
}

export default async function PlanningAlertUnsubscribePage({ searchParams }: Props) {
  const { token = "", status } = await searchParams
  if (status === "stopped") {
    return <UnsubscribeShell title="Email updates stopped" body="You will no longer receive updates for this planning application." />
  }

  let valid = false
  try {
    valid = Boolean(verifyPlanningAlertUnsubscribeToken(token))
  } catch (error) {
    console.error("Planning alert unsubscribe page is not configured.", error)
  }

  if (status === "invalid" || !valid) {
    return <UnsubscribeShell title="This link is not valid" body="Use the latest planning update email or manage your alerts after signing in." />
  }

  return (
    <main className="min-h-screen bg-stone-50 px-6 py-16">
      <section className="mx-auto max-w-lg rounded-3xl border border-stone-200 bg-white p-8 shadow-sm">
        <p className="text-sm font-semibold uppercase tracking-[0.16em] text-emerald-700">Planning email updates</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-stone-950">Stop updates for this application?</h1>
        <p className="mt-4 leading-7 text-stone-600">This does not require you to sign in. You can restart updates later from the planning application.</p>
        <form action={unsubscribePlanningAlert} className="mt-7">
          <input type="hidden" name="token" value={token} />
          <button type="submit" className="inline-flex min-h-11 w-full items-center justify-center rounded-lg bg-stone-900 px-5 text-sm font-semibold text-white transition hover:bg-stone-700">
            Stop email updates
          </button>
        </form>
        <Link href="/planning" className="mt-5 inline-flex text-sm font-semibold text-stone-600 underline underline-offset-4 hover:text-stone-950">Back to Planning</Link>
      </section>
    </main>
  )
}

function UnsubscribeShell({ title, body }: { title: string; body: string }) {
  return (
    <main className="min-h-screen bg-stone-50 px-6 py-16">
      <section className="mx-auto max-w-lg rounded-3xl border border-stone-200 bg-white p-8 shadow-sm">
        <h1 className="text-3xl font-semibold tracking-tight text-stone-950">{title}</h1>
        <p className="mt-4 leading-7 text-stone-600">{body}</p>
        <div className="mt-7 flex flex-wrap gap-4">
          <Link href="/planning" className="font-semibold text-emerald-700 underline underline-offset-4 hover:text-emerald-900">Browse Planning</Link>
          <Link href="/my-alerts" className="font-semibold text-stone-600 underline underline-offset-4 hover:text-stone-950">My alerts</Link>
        </div>
      </section>
    </main>
  )
}
