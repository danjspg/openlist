import type { Metadata } from "next"
import Link from "next/link"
import { redirect } from "next/navigation"
import { getServerSupabase } from "@/lib/supabase"
import { requireSellerUser } from "@/lib/seller-auth"
import {
  formatViewingDateTime,
  getCurrentTimeMs,
  getViewingStatusLabel,
  type ViewingRow,
} from "@/lib/viewings"
import { cancelViewing } from "./actions"

export const metadata: Metadata = {
  title: "My Viewings | OpenList",
  robots: {
    index: false,
    follow: false,
  },
}

function statusClasses(status: ViewingRow["status"]) {
  if (status === "cancelled") return "bg-red-50 text-red-700 ring-red-200"
  if (status === "completed") return "bg-emerald-50 text-emerald-700 ring-emerald-200"
  return "bg-stone-100 text-stone-700 ring-stone-200"
}

function ViewingCard({ viewing }: { viewing: ViewingRow }) {
  return (
    <article className="rounded-[24px] border border-stone-200 bg-white p-5 shadow-sm sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ring-1 ${statusClasses(viewing.status)}`}>
              {getViewingStatusLabel(viewing.status)}
            </span>
            <span className="text-sm text-stone-500">
              {formatViewingDateTime(viewing.viewing_starts_at)}
            </span>
          </div>

          <h2 className="mt-3 text-2xl font-semibold tracking-tight text-stone-900">
            {viewing.property_location}
          </h2>
          <p className="mt-2 text-sm text-stone-600">
            Viewer: <span className="font-medium text-stone-900">{viewing.viewer_name}</span>
          </p>
        </div>
      </div>

      <div className="mt-5 grid gap-3 text-sm sm:grid-cols-2">
        <div className="rounded-2xl border border-stone-200 bg-stone-50 p-4">
          <p className="text-xs uppercase tracking-[0.18em] text-stone-500">Viewer contact</p>
          <p className="mt-2 break-words font-medium text-stone-900">{viewing.viewer_email}</p>
          {viewing.viewer_phone && (
            <p className="mt-1 text-stone-600">{viewing.viewer_phone}</p>
          )}
        </div>
        <div className="rounded-2xl border border-stone-200 bg-stone-50 p-4">
          <p className="text-xs uppercase tracking-[0.18em] text-stone-500">Seller contact</p>
          <p className="mt-2 font-medium text-stone-900">{viewing.contact_name}</p>
          <p className="break-words text-stone-600">{viewing.contact_email}</p>
        </div>
      </div>

      <div className="mt-5 flex flex-wrap gap-3">
        <Link
          href={`/my-viewings/${viewing.id}`}
          className="inline-flex items-center rounded-full border border-stone-300 bg-white px-4 py-2 text-sm font-medium text-stone-700 transition hover:border-stone-400 hover:text-stone-900"
        >
          View details
        </Link>
        <Link
          href={`/my-viewings/new?from=${viewing.id}`}
          className="inline-flex items-center rounded-full border border-stone-300 bg-white px-4 py-2 text-sm font-medium text-stone-700 transition hover:border-stone-400 hover:text-stone-900"
        >
          Create similar
        </Link>

        {viewing.status === "scheduled" && (
          <form action={cancelViewing}>
            <input type="hidden" name="id" value={viewing.id} />
            <button
              type="submit"
              className="inline-flex items-center rounded-full border border-red-200 bg-red-50 px-4 py-2 text-sm font-medium text-red-700 transition hover:border-red-300 hover:bg-red-100"
            >
              Cancel viewing
            </button>
          </form>
        )}
      </div>
    </article>
  )
}

export default async function MyViewingsPage({
  searchParams,
}: {
  searchParams: Promise<{ created?: string }>
}) {
  const { created } = await searchParams
  const currentUser = await requireSellerUser().catch(() => null)

  if (!currentUser) {
    redirect("/sign-in?redirectTo=%2Fmy-viewings")
  }

  const supabase = getServerSupabase()
  const { data, error } = await supabase
    .from("viewings")
    .select("*")
    .eq("owner_user_id", currentUser.id)
    .order("viewing_starts_at", { ascending: true })

  const viewings = (data ?? []) as ViewingRow[]
  const now = await getCurrentTimeMs()
  const upcoming = viewings.filter(
    (viewing) =>
      viewing.status === "scheduled" &&
      new Date(viewing.viewing_starts_at).getTime() >= now
  )
  const past = viewings.filter((viewing) => !upcoming.includes(viewing))

  return (
    <main className="min-h-screen bg-stone-50">
      <section className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-12">
        <div className="mb-8 rounded-[32px] border border-stone-200 bg-white p-6 shadow-sm sm:p-8">
          <div className="flex flex-wrap items-start justify-between gap-5">
            <div>
              <p className="text-sm font-medium uppercase tracking-[0.24em] text-stone-500">
                OpenList
              </p>
              <h1 className="mt-3 text-4xl font-semibold tracking-tight text-stone-900 sm:text-5xl">
                My Viewings
              </h1>
              <p className="mt-4 max-w-2xl text-base leading-7 text-stone-600">
                A simple way to arrange and remember property viewings.
              </p>
            </div>

            <Link
              href="/my-viewings/new"
              className="inline-flex items-center rounded-full bg-stone-900 px-5 py-3 text-sm font-medium text-white transition hover:bg-stone-700"
            >
              New viewing
            </Link>
          </div>
        </div>

        {created === "1" && (
          <div className="mb-6 rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-emerald-800">
            Viewing created and confirmation emails sent.
          </div>
        )}

        {error ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-red-700">
            Database error: {error.message}
          </div>
        ) : (
          <div className="space-y-10">
            <section>
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-xl font-semibold tracking-tight text-stone-900">
                  Upcoming viewings
                </h2>
                <span className="text-sm text-stone-500">{upcoming.length}</span>
              </div>

              {upcoming.length > 0 ? (
                <div className="space-y-4">
                  {upcoming.map((viewing) => (
                    <ViewingCard key={viewing.id} viewing={viewing} />
                  ))}
                </div>
              ) : (
                <div className="rounded-[24px] border border-stone-200 bg-white p-8 text-center text-stone-600 shadow-sm">
                  No upcoming viewings.
                </div>
              )}
            </section>

            <section>
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-xl font-semibold tracking-tight text-stone-900">
                  Past viewings
                </h2>
                <span className="text-sm text-stone-500">{past.length}</span>
              </div>

              {past.length > 0 ? (
                <div className="space-y-4">
                  {past.map((viewing) => (
                    <ViewingCard key={viewing.id} viewing={viewing} />
                  ))}
                </div>
              ) : (
                <div className="rounded-[24px] border border-stone-200 bg-white p-8 text-center text-stone-600 shadow-sm">
                  No past viewings.
                </div>
              )}
            </section>
          </div>
        )}
      </section>
    </main>
  )
}
