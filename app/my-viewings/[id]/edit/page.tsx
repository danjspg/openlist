import type { Metadata } from "next"
import Link from "next/link"
import { notFound, redirect } from "next/navigation"
import { getServerSupabase } from "@/lib/supabase"
import { requireSellerUser } from "@/lib/seller-auth"
import {
  formatDateInput,
  formatTimeInput,
  splitPropertyLocation,
  type ViewingRow,
} from "@/lib/viewings"
import { updateViewing } from "../../actions"

export const metadata: Metadata = {
  title: "Update Viewing | OpenList",
  robots: {
    index: false,
    follow: false,
  },
}

export default async function EditViewingPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const currentUser = await requireSellerUser().catch(() => null)

  if (!currentUser) {
    redirect(`/sign-in?redirectTo=${encodeURIComponent(`/my-viewings/${id}/edit`)}`)
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
  const location = splitPropertyLocation(viewing.property_location)

  return (
    <main className="min-h-screen bg-stone-50">
      <section className="mx-auto max-w-4xl px-4 py-10 sm:px-6 sm:py-12">
        <div className="mb-8">
          <Link
            href={`/my-viewings/${viewing.id}`}
            className="text-sm font-medium text-stone-500 transition hover:text-stone-900"
          >
            Back to viewing
          </Link>
        </div>

        <div className="rounded-[32px] border border-stone-200 bg-white p-6 shadow-sm sm:p-8">
          <p className="text-sm font-medium uppercase tracking-[0.24em] text-stone-500">
            Viewing Planner
          </p>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight text-stone-900 sm:text-5xl">
            Update viewing
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-7 text-stone-600">
            Adjust the appointment details and choose who should receive the update email.
          </p>

          {viewing.status === "cancelled" ? (
            <div className="mt-8 rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-red-700">
              Cancelled viewings cannot be updated.
            </div>
          ) : (
            <form action={updateViewing} className="mt-8 space-y-8">
              <input type="hidden" name="id" value={viewing.id} />

              <section>
                <h2 className="text-lg font-semibold tracking-tight text-stone-900">
                  Viewing details
                </h2>
                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  <label className="sm:col-span-2">
                    <span className="text-sm font-medium text-stone-700">Property address / location</span>
                    <textarea
                      name="propertyAddress"
                      required
                      rows={3}
                      defaultValue={location.address}
                      className="mt-2 w-full rounded-2xl border border-stone-300 bg-white px-4 py-3 text-stone-900 outline-none transition focus:border-stone-900"
                    />
                  </label>

                  <label>
                    <span className="text-sm font-medium text-stone-700">Eircode, optional</span>
                    <input
                      name="propertyEircode"
                      defaultValue={location.eircode}
                      pattern="[A-Za-z0-9]{3}\s?[A-Za-z0-9]{4}"
                      className="mt-2 h-12 w-full rounded-2xl border border-stone-300 bg-white px-4 uppercase text-stone-900 outline-none transition placeholder:normal-case focus:border-stone-900"
                    />
                  </label>

                  <label>
                    <span className="text-sm font-medium text-stone-700">Viewing date</span>
                    <input
                      type="date"
                      name="viewingDate"
                      required
                      defaultValue={formatDateInput(viewing.viewing_starts_at)}
                      className="mt-2 h-12 w-full rounded-2xl border border-stone-300 bg-white px-4 text-stone-900 outline-none transition focus:border-stone-900"
                    />
                  </label>

                  <label>
                    <span className="text-sm font-medium text-stone-700">Viewing time</span>
                    <input
                      type="time"
                      name="viewingTime"
                      required
                      defaultValue={formatTimeInput(viewing.viewing_starts_at)}
                      className="mt-2 h-12 w-full rounded-2xl border border-stone-300 bg-white px-4 text-stone-900 outline-none transition focus:border-stone-900"
                    />
                  </label>
                </div>
              </section>

              <section>
                <h2 className="text-lg font-semibold tracking-tight text-stone-900">
                  Viewer
                </h2>
                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  <label>
                    <span className="text-sm font-medium text-stone-700">Viewer name</span>
                    <input
                      name="viewerName"
                      required
                      defaultValue={viewing.viewer_name}
                      className="mt-2 h-12 w-full rounded-2xl border border-stone-300 bg-white px-4 text-stone-900 outline-none transition focus:border-stone-900"
                    />
                  </label>

                  <label>
                    <span className="text-sm font-medium text-stone-700">Viewer email</span>
                    <input
                      type="email"
                      name="viewerEmail"
                      required
                      defaultValue={viewing.viewer_email}
                      className="mt-2 h-12 w-full rounded-2xl border border-stone-300 bg-white px-4 text-stone-900 outline-none transition focus:border-stone-900"
                    />
                  </label>

                  <label>
                    <span className="text-sm font-medium text-stone-700">Viewer phone, optional</span>
                    <input
                      name="viewerPhone"
                      defaultValue={viewing.viewer_phone ?? ""}
                      className="mt-2 h-12 w-full rounded-2xl border border-stone-300 bg-white px-4 text-stone-900 outline-none transition focus:border-stone-900"
                    />
                  </label>
                </div>
              </section>

              <section>
                <h2 className="text-lg font-semibold tracking-tight text-stone-900">
                  Seller contact
                </h2>
                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  <label>
                    <span className="text-sm font-medium text-stone-700">Seller contact name</span>
                    <input
                      name="contactName"
                      required
                      defaultValue={viewing.contact_name}
                      className="mt-2 h-12 w-full rounded-2xl border border-stone-300 bg-white px-4 text-stone-900 outline-none transition focus:border-stone-900"
                    />
                  </label>

                  <label>
                    <span className="text-sm font-medium text-stone-700">Seller contact email</span>
                    <input
                      type="email"
                      name="contactEmail"
                      required
                      defaultValue={viewing.contact_email}
                      className="mt-2 h-12 w-full rounded-2xl border border-stone-300 bg-white px-4 text-stone-900 outline-none transition focus:border-stone-900"
                    />
                  </label>

                  <label>
                    <span className="text-sm font-medium text-stone-700">Seller contact phone, optional</span>
                    <input
                      name="contactPhone"
                      defaultValue={viewing.contact_phone ?? ""}
                      className="mt-2 h-12 w-full rounded-2xl border border-stone-300 bg-white px-4 text-stone-900 outline-none transition focus:border-stone-900"
                    />
                  </label>
                </div>
              </section>

              <section>
                <label>
                  <span className="text-sm font-medium text-stone-700">Notes, optional</span>
                  <textarea
                    name="notes"
                    rows={4}
                    defaultValue={viewing.notes ?? ""}
                    className="mt-2 w-full rounded-2xl border border-stone-300 bg-white px-4 py-3 text-stone-900 outline-none transition focus:border-stone-900"
                  />
                </label>
              </section>

              <section>
                <h2 className="text-lg font-semibold tracking-tight text-stone-900">
                  Email options
                </h2>
                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  <div className="rounded-2xl border border-stone-200 bg-stone-50 p-4">
                    <p className="text-sm font-semibold text-stone-900">
                      Send update email
                    </p>
                    <div className="mt-4 space-y-3">
                      <label className="flex items-start gap-3">
                        <input
                          type="checkbox"
                          name="sendUpdateToViewer"
                          defaultChecked
                          className="mt-1 h-4 w-4 rounded border-stone-300 text-stone-900"
                        />
                        <span className="text-sm leading-6 text-stone-700">
                          Send to viewer
                        </span>
                      </label>
                      <label className="flex items-start gap-3">
                        <input
                          type="checkbox"
                          name="sendUpdateToSeller"
                          defaultChecked
                          className="mt-1 h-4 w-4 rounded border-stone-300 text-stone-900"
                        />
                        <span className="text-sm leading-6 text-stone-700">
                          Send to seller contact
                        </span>
                      </label>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-stone-200 bg-stone-50 p-4">
                    <p className="text-sm font-semibold text-stone-900">
                      Future reminders
                    </p>
                    <div className="mt-4 space-y-3">
                      <label className="flex items-start gap-3">
                        <input
                          type="checkbox"
                          name="sendReminderToViewer"
                          defaultChecked={viewing.send_reminder_to_viewer !== false}
                          className="mt-1 h-4 w-4 rounded border-stone-300 text-stone-900"
                        />
                        <span className="text-sm leading-6 text-stone-700">
                          Send reminder to viewer
                        </span>
                      </label>
                      <label className="flex items-start gap-3">
                        <input
                          type="checkbox"
                          name="sendReminderToSeller"
                          defaultChecked={viewing.send_reminder_to_seller !== false}
                          className="mt-1 h-4 w-4 rounded border-stone-300 text-stone-900"
                        />
                        <span className="text-sm leading-6 text-stone-700">
                          Send reminder to seller contact
                        </span>
                      </label>
                    </div>
                  </div>
                </div>

                <input
                  type="hidden"
                  name="sendConfirmationToViewer"
                  value={viewing.send_confirmation_to_viewer === false ? "" : "on"}
                />
                <input
                  type="hidden"
                  name="sendConfirmationToSeller"
                  value={viewing.send_confirmation_to_seller === false ? "" : "on"}
                />
              </section>

              <div className="flex flex-wrap gap-3 border-t border-stone-200 pt-6">
                <button
                  type="submit"
                  className="inline-flex items-center rounded-full bg-stone-900 px-6 py-3 text-sm font-medium text-white transition hover:bg-stone-700"
                >
                  Update viewing
                </button>
                <Link
                  href={`/my-viewings/${viewing.id}`}
                  className="inline-flex items-center rounded-full border border-stone-300 px-6 py-3 text-sm font-medium text-stone-700 transition hover:border-stone-400 hover:text-stone-900"
                >
                  Cancel
                </Link>
              </div>
            </form>
          )}
        </div>
      </section>
    </main>
  )
}
