import type { Metadata } from "next"
import Link from "next/link"
import { notFound, redirect } from "next/navigation"
import { getServerSupabase } from "@/lib/supabase"
import { requireSellerUser } from "@/lib/seller-auth"
import {
  formatViewingDateTime,
  getViewingStatusLabel,
  type ViewingRow,
} from "@/lib/viewings"
import { cancelViewing } from "../actions"

export const metadata: Metadata = {
  title: "Viewing Details | OpenList",
  robots: {
    index: false,
    follow: false,
  },
}

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-stone-200 bg-stone-50 p-4">
      <p className="text-xs uppercase tracking-[0.18em] text-stone-500">{label}</p>
      <div className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-stone-900">
        {children}
      </div>
    </div>
  )
}

export default async function ViewingDetailsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ cancelled?: string }>
}) {
  const [{ id }, { cancelled }] = await Promise.all([params, searchParams])
  const currentUser = await requireSellerUser().catch(() => null)

  if (!currentUser) {
    redirect(`/sign-in?redirectTo=${encodeURIComponent(`/my-viewings/${id}`)}`)
  }

  const supabase = getServerSupabase()
  const { data, error } = await supabase
    .from("viewings")
    .select("*")
    .eq("id", id)
    .eq("owner_user_id", currentUser.id)
    .maybeSingle()

  if (error) {
    throw new Error(error.message)
  }

  if (!data) {
    notFound()
  }

  const viewing = data as ViewingRow

  return (
    <main className="min-h-screen bg-stone-50">
      <section className="mx-auto max-w-4xl px-4 py-10 sm:px-6 sm:py-12">
        <div className="mb-8">
          <Link
            href="/my-viewings"
            className="text-sm font-medium text-stone-500 transition hover:text-stone-900"
          >
            Back to my viewings
          </Link>
        </div>

        {cancelled === "1" && (
          <div className="mb-6 rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-emerald-800">
            Viewing cancelled and emails sent.
          </div>
        )}

        <div className="rounded-[32px] border border-stone-200 bg-white p-6 shadow-sm sm:p-8">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-sm font-medium uppercase tracking-[0.24em] text-stone-500">
                Viewing
              </p>
              <h1 className="mt-3 text-4xl font-semibold tracking-tight text-stone-900 sm:text-5xl">
                {viewing.property_location}
              </h1>
              <p className="mt-4 text-base leading-7 text-stone-600">
                {formatViewingDateTime(viewing.viewing_starts_at)}
              </p>
            </div>

            <span className="inline-flex rounded-full bg-stone-100 px-3 py-1 text-sm font-semibold text-stone-700 ring-1 ring-stone-200">
              {getViewingStatusLabel(viewing.status)}
            </span>
          </div>

          <div className="mt-8 grid gap-4 sm:grid-cols-2">
            <Detail label="Location">{viewing.property_location}</Detail>
            <Detail label="When">{formatViewingDateTime(viewing.viewing_starts_at)}</Detail>
            <Detail label="Viewer">
              <strong>{viewing.viewer_name}</strong>
              <br />
              {viewing.viewer_email}
              {viewing.viewer_phone && (
                <>
                  <br />
                  {viewing.viewer_phone}
                </>
              )}
            </Detail>
            <Detail label="Seller contact">
              <strong>{viewing.contact_name}</strong>
              <br />
              {viewing.contact_email}
              {viewing.contact_phone && (
                <>
                  <br />
                  {viewing.contact_phone}
                </>
              )}
            </Detail>
            <div className="sm:col-span-2">
              <Detail label="Notes">{viewing.notes || "No notes added."}</Detail>
            </div>
            <div className="sm:col-span-2">
              <Detail label="Email options">
                Confirmation: viewer {viewing.send_confirmation_to_viewer === false ? "off" : "on"}, seller contact{" "}
                {viewing.send_confirmation_to_seller === false ? "off" : "on"}
                <br />
                Reminder: viewer {viewing.send_reminder_to_viewer === false ? "off" : "on"}, seller contact{" "}
                {viewing.send_reminder_to_seller === false ? "off" : "on"}
              </Detail>
            </div>
          </div>

          <div className="mt-8 flex flex-wrap gap-3 border-t border-stone-200 pt-6">
            {viewing.status === "scheduled" && (
              <form action={cancelViewing}>
                <input type="hidden" name="id" value={viewing.id} />
                <button
                  type="submit"
                  className="inline-flex items-center rounded-full border border-red-200 bg-red-50 px-5 py-3 text-sm font-medium text-red-700 transition hover:border-red-300 hover:bg-red-100"
                >
                  Cancel viewing
                </button>
              </form>
            )}
            <Link
              href="/my-viewings"
              className="inline-flex items-center rounded-full border border-stone-300 px-5 py-3 text-sm font-medium text-stone-700 transition hover:border-stone-400 hover:text-stone-900"
            >
              View all
            </Link>
          </div>
        </div>
      </section>
    </main>
  )
}
