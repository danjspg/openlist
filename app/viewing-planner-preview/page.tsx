import Link from "next/link"
import { notFound } from "next/navigation"
import {
  formatViewingDateTime,
  getViewingStatusLabel,
  type ViewingRow,
} from "@/lib/viewings"

export const metadata = {
  title: "Viewing Planner Preview | OpenList",
  robots: {
    index: false,
    follow: false,
  },
}

const previewViewings: ViewingRow[] = [
  {
    id: "preview-1",
    created_at: new Date().toISOString(),
    owner_user_id: "preview",
    viewer_name: "Aoife Murphy",
    viewer_email: "aoife@example.com",
    viewer_phone: "087 000 0000",
    contact_name: "Daniel",
    contact_email: "seller@example.com",
    contact_phone: "086 000 0000",
    property_location: "12 Harbour View, Kinsale, Co. Cork",
    viewing_starts_at: new Date(Date.now() + 27 * 60 * 60 * 1000).toISOString(),
    notes: "Meet at the front gate. Parking is available across the road.",
    status: "scheduled",
  },
  {
    id: "preview-2",
    created_at: new Date().toISOString(),
    owner_user_id: "preview",
    viewer_name: "Mark O'Brien",
    viewer_email: "mark@example.com",
    contact_name: "Daniel",
    contact_email: "seller@example.com",
    property_location: "Apartment 4, Main Street, Midleton, Co. Cork",
    viewing_starts_at: new Date(Date.now() - 30 * 60 * 60 * 1000).toISOString(),
    notes: null,
    status: "completed",
  },
]

function statusClasses(status: ViewingRow["status"]) {
  if (status === "cancelled") return "bg-red-50 text-red-700 ring-red-200"
  if (status === "completed") return "bg-emerald-50 text-emerald-700 ring-emerald-200"
  return "bg-stone-100 text-stone-700 ring-stone-200"
}

function PreviewCard({ viewing }: { viewing: ViewingRow }) {
  return (
    <article className="rounded-[24px] border border-stone-200 bg-white p-5 shadow-sm">
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
          {viewing.viewer_phone && <p className="mt-1 text-stone-600">{viewing.viewer_phone}</p>}
        </div>
        <div className="rounded-2xl border border-stone-200 bg-stone-50 p-4">
          <p className="text-xs uppercase tracking-[0.18em] text-stone-500">Seller contact</p>
          <p className="mt-2 font-medium text-stone-900">{viewing.contact_name}</p>
          <p className="break-words text-stone-600">{viewing.contact_email}</p>
        </div>
      </div>
    </article>
  )
}

export default function ViewingPlannerPreviewPage() {
  if (process.env.NODE_ENV === "production") {
    notFound()
  }

  const upcoming = previewViewings.filter((viewing) => viewing.status === "scheduled")
  const past = previewViewings.filter((viewing) => viewing.status !== "scheduled")

  return (
    <main className="min-h-screen bg-stone-50">
      <section className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-12">
        <div className="mb-8 rounded-[32px] border border-stone-200 bg-white p-6 shadow-sm sm:p-8">
          <p className="text-sm font-medium uppercase tracking-[0.24em] text-stone-500">
            Preview
          </p>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight text-stone-900 sm:text-5xl">
            Viewing Planner
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-7 text-stone-600">
            A simple way to arrange and remember property viewings. This preview skips sign-in and does not save or send emails.
          </p>
        </div>

        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_380px]">
          <div className="space-y-8">
            <section>
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-xl font-semibold tracking-tight text-stone-900">
                  Upcoming viewings
                </h2>
                <span className="text-sm text-stone-500">{upcoming.length}</span>
              </div>
              <div className="space-y-4">
                {upcoming.map((viewing) => (
                  <PreviewCard key={viewing.id} viewing={viewing} />
                ))}
              </div>
            </section>

            <section>
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-xl font-semibold tracking-tight text-stone-900">
                  Past viewings
                </h2>
                <span className="text-sm text-stone-500">{past.length}</span>
              </div>
              <div className="space-y-4">
                {past.map((viewing) => (
                  <PreviewCard key={viewing.id} viewing={viewing} />
                ))}
              </div>
            </section>
          </div>

          <aside className="rounded-[28px] border border-stone-200 bg-white p-5 shadow-sm sm:p-6">
            <h2 className="text-xl font-semibold tracking-tight text-stone-900">
              New viewing form
            </h2>
            <form className="mt-5 space-y-4">
              <label className="block">
                <span className="text-sm font-medium text-stone-700">Property address / location</span>
                <textarea
                  rows={3}
                  defaultValue="12 Harbour View, Kinsale, Co. Cork"
                  className="mt-2 w-full rounded-2xl border border-stone-300 bg-white px-4 py-3 text-stone-900 outline-none transition focus:border-stone-900"
                />
              </label>

              <label className="block">
                <span className="text-sm font-medium text-stone-700">Eircode, optional</span>
                <input
                  defaultValue="P17 X000"
                  className="mt-2 h-12 w-full rounded-2xl border border-stone-300 bg-white px-4 uppercase text-stone-900 outline-none transition focus:border-stone-900"
                />
                <a
                  href="https://finder.eircode.ie/"
                  target="_blank"
                  rel="noreferrer"
                  className="mt-2 inline-flex text-xs font-medium text-stone-500 underline underline-offset-4 transition hover:text-stone-900"
                >
                  Search Eircode
                </a>
              </label>

              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
                <label className="block">
                  <span className="text-sm font-medium text-stone-700">Viewing date</span>
                  <input
                    type="date"
                    defaultValue="2026-06-01"
                    className="mt-2 h-12 w-full rounded-2xl border border-stone-300 bg-white px-4 text-stone-900 outline-none transition focus:border-stone-900"
                  />
                </label>

                <label className="block">
                  <span className="text-sm font-medium text-stone-700">Viewing time</span>
                  <input
                    type="time"
                    defaultValue="12:00"
                    className="mt-2 h-12 w-full rounded-2xl border border-stone-300 bg-white px-4 text-stone-900 outline-none transition focus:border-stone-900"
                  />
                </label>
              </div>

              <label className="block">
                <span className="text-sm font-medium text-stone-700">Viewer name</span>
                <input
                  defaultValue="Aoife Murphy"
                  className="mt-2 h-12 w-full rounded-2xl border border-stone-300 bg-white px-4 text-stone-900 outline-none transition focus:border-stone-900"
                />
              </label>

              <label className="block">
                <span className="text-sm font-medium text-stone-700">Viewer email</span>
                <input
                  type="email"
                  defaultValue="aoife@example.com"
                  className="mt-2 h-12 w-full rounded-2xl border border-stone-300 bg-white px-4 text-stone-900 outline-none transition focus:border-stone-900"
                />
              </label>

              <label className="block">
                <span className="text-sm font-medium text-stone-700">Viewer phone, optional</span>
                <input
                  defaultValue="087 000 0000"
                  className="mt-2 h-12 w-full rounded-2xl border border-stone-300 bg-white px-4 text-stone-900 outline-none transition focus:border-stone-900"
                />
              </label>

              <div className="border-t border-stone-200 pt-4">
                <p className="text-sm font-semibold text-stone-900">Seller contact</p>
                <p className="mt-1 text-sm leading-6 text-stone-500">
                  Use your own details, or the details of the person who will meet the viewer.
                </p>
              </div>

              <label className="block">
                <span className="text-sm font-medium text-stone-700">Seller contact name</span>
                <input
                  defaultValue="Donal"
                  className="mt-2 h-12 w-full rounded-2xl border border-stone-300 bg-white px-4 text-stone-900 outline-none transition focus:border-stone-900"
                />
              </label>

              <label className="block">
                <span className="text-sm font-medium text-stone-700">Seller contact email</span>
                <input
                  type="email"
                  defaultValue="seller@example.com"
                  className="mt-2 h-12 w-full rounded-2xl border border-stone-300 bg-white px-4 text-stone-900 outline-none transition focus:border-stone-900"
                />
              </label>

              <label className="block">
                <span className="text-sm font-medium text-stone-700">Seller contact phone, optional</span>
                <input
                  defaultValue="086 000 0000"
                  className="mt-2 h-12 w-full rounded-2xl border border-stone-300 bg-white px-4 text-stone-900 outline-none transition focus:border-stone-900"
                />
              </label>

              <label className="block">
                <span className="text-sm font-medium text-stone-700">Notes, optional</span>
                <textarea
                  rows={4}
                  defaultValue="Meet at the front gate."
                  className="mt-2 w-full rounded-2xl border border-stone-300 bg-white px-4 py-3 text-stone-900 outline-none transition focus:border-stone-900"
                />
              </label>

              <div className="border-t border-stone-200 pt-4">
                <p className="text-sm font-semibold text-stone-900">Email options</p>
                <p className="mt-1 text-sm leading-6 text-stone-500">
                  Choose who should receive each email.
                </p>
              </div>

              <div className="rounded-2xl border border-stone-200 bg-stone-50 p-4">
                <p className="text-sm font-semibold text-stone-900">Confirmation email</p>
                <div className="mt-3 space-y-3">
                  <label className="flex items-start gap-3">
                    <input type="checkbox" defaultChecked className="mt-1 h-4 w-4" />
                    <span className="text-sm leading-6 text-stone-700">Send to viewer</span>
                  </label>
                  <label className="flex items-start gap-3">
                    <input type="checkbox" defaultChecked className="mt-1 h-4 w-4" />
                    <span className="text-sm leading-6 text-stone-700">Send to seller contact</span>
                  </label>
                </div>
              </div>

              <div className="rounded-2xl border border-stone-200 bg-stone-50 p-4">
                <p className="text-sm font-semibold text-stone-900">Reminder email</p>
                <p className="mt-1 text-xs leading-5 text-stone-500">
                  Sent about 1 day before the viewing.
                </p>
                <div className="mt-3 space-y-3">
                  <label className="flex items-start gap-3">
                    <input type="checkbox" defaultChecked className="mt-1 h-4 w-4" />
                    <span className="text-sm leading-6 text-stone-700">Send to viewer</span>
                  </label>
                  <label className="flex items-start gap-3">
                    <input type="checkbox" defaultChecked className="mt-1 h-4 w-4" />
                    <span className="text-sm leading-6 text-stone-700">Send to seller contact</span>
                  </label>
                </div>
              </div>

              <button
                type="button"
                className="inline-flex items-center rounded-full bg-stone-900 px-5 py-3 text-sm font-medium text-white"
              >
                Create viewing
              </button>
            </form>
          </aside>
        </div>

        <div className="mt-8">
          <Link href="/my-viewings/new" className="text-sm font-medium text-stone-500 hover:text-stone-900">
            Real signed-in form
          </Link>
        </div>
      </section>
    </main>
  )
}
