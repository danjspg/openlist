import type { Metadata } from "next"
import Link from "next/link"
import { redirect } from "next/navigation"
import { getCurrentSellerUser } from "@/lib/seller-auth"
import { getTomorrowDateInput } from "@/lib/viewings"
import { createViewing } from "../actions"

export const metadata: Metadata = {
  title: "New Viewing | OpenList",
  robots: {
    index: false,
    follow: false,
  },
}

export default async function NewViewingPage() {
  const currentUser = await getCurrentSellerUser()

  if (!currentUser) {
    redirect("/sign-in?redirectTo=%2Fmy-viewings%2Fnew")
  }

  const tomorrowDateInput = await getTomorrowDateInput()

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

        <div className="rounded-[32px] border border-stone-200 bg-white p-6 shadow-sm sm:p-8">
          <p className="text-sm font-medium uppercase tracking-[0.24em] text-stone-500">
            Viewing Planner
          </p>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight text-stone-900 sm:text-5xl">
            New viewing
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-7 text-stone-600">
            Add the time, place and viewer details, then choose who should receive each email.
          </p>

          <form action={createViewing} className="mt-8 space-y-8">
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
                    placeholder="Street, town, county, or meeting point"
                    className="mt-2 w-full rounded-2xl border border-stone-300 bg-white px-4 py-3 text-stone-900 outline-none transition focus:border-stone-900"
                  />
                </label>

                <label>
                  <span className="text-sm font-medium text-stone-700">Eircode, optional</span>
                  <input
                    name="propertyEircode"
                    placeholder="A65 F4E2"
                    className="mt-2 h-12 w-full rounded-2xl border border-stone-300 bg-white px-4 uppercase text-stone-900 outline-none transition placeholder:normal-case focus:border-stone-900"
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

                <label>
                  <span className="text-sm font-medium text-stone-700">Viewing date</span>
                  <input
                    type="date"
                    name="viewingDate"
                    required
                    defaultValue={tomorrowDateInput}
                    className="mt-2 h-12 w-full rounded-2xl border border-stone-300 bg-white px-4 text-stone-900 outline-none transition focus:border-stone-900"
                  />
                </label>

                <label>
                  <span className="text-sm font-medium text-stone-700">Viewing time</span>
                  <input
                    type="time"
                    name="viewingTime"
                    required
                    defaultValue="12:00"
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
                    className="mt-2 h-12 w-full rounded-2xl border border-stone-300 bg-white px-4 text-stone-900 outline-none transition focus:border-stone-900"
                  />
                </label>

                <label>
                  <span className="text-sm font-medium text-stone-700">Viewer email</span>
                  <input
                    type="email"
                    name="viewerEmail"
                    required
                    className="mt-2 h-12 w-full rounded-2xl border border-stone-300 bg-white px-4 text-stone-900 outline-none transition focus:border-stone-900"
                  />
                </label>

                <label>
                  <span className="text-sm font-medium text-stone-700">Viewer phone, optional</span>
                  <input
                    name="viewerPhone"
                    className="mt-2 h-12 w-full rounded-2xl border border-stone-300 bg-white px-4 text-stone-900 outline-none transition focus:border-stone-900"
                  />
                </label>
              </div>
            </section>

            <section>
              <h2 className="text-lg font-semibold tracking-tight text-stone-900">
                Seller contact
              </h2>
              <p className="mt-2 text-sm leading-6 text-stone-500">
                Use your own details, or the details of the person who will meet the viewer.
              </p>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <label>
                  <span className="text-sm font-medium text-stone-700">Seller contact name</span>
                  <input
                    name="contactName"
                    required
                    placeholder="e.g. Donal"
                    className="mt-2 h-12 w-full rounded-2xl border border-stone-300 bg-white px-4 text-stone-900 outline-none transition focus:border-stone-900"
                  />
                </label>

                <label>
                  <span className="text-sm font-medium text-stone-700">Seller contact email</span>
                  <input
                    type="email"
                    name="contactEmail"
                    required
                    defaultValue={currentUser.email ?? ""}
                    className="mt-2 h-12 w-full rounded-2xl border border-stone-300 bg-white px-4 text-stone-900 outline-none transition focus:border-stone-900"
                  />
                </label>

                <label>
                  <span className="text-sm font-medium text-stone-700">Seller contact phone, optional</span>
                  <input
                    name="contactPhone"
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
                  className="mt-2 w-full rounded-2xl border border-stone-300 bg-white px-4 py-3 text-stone-900 outline-none transition focus:border-stone-900"
                />
              </label>
            </section>

            <section>
              <h2 className="text-lg font-semibold tracking-tight text-stone-900">
                Email options
              </h2>
              <p className="mt-2 text-sm leading-6 text-stone-500">
                Choose who should receive confirmation and reminder emails for this viewing.
              </p>

              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <div className="rounded-2xl border border-stone-200 bg-stone-50 p-4">
                  <p className="text-sm font-semibold text-stone-900">
                    Confirmation email
                  </p>
                  <div className="mt-4 space-y-3">
                    <label className="flex items-start gap-3">
                      <input
                        type="checkbox"
                        name="sendConfirmationToViewer"
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
                        name="sendConfirmationToSeller"
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
                    Reminder email
                  </p>
                  <p className="mt-1 text-xs leading-5 text-stone-500">
                    Sent about 1 day before the viewing.
                  </p>
                  <div className="mt-4 space-y-3">
                    <label className="flex items-start gap-3">
                      <input
                        type="checkbox"
                        name="sendReminderToViewer"
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
                        name="sendReminderToSeller"
                        defaultChecked
                        className="mt-1 h-4 w-4 rounded border-stone-300 text-stone-900"
                      />
                      <span className="text-sm leading-6 text-stone-700">
                        Send to seller contact
                      </span>
                    </label>
                  </div>
                </div>
              </div>
            </section>

            <div className="flex flex-wrap gap-3 border-t border-stone-200 pt-6">
              <button
                type="submit"
                className="inline-flex items-center rounded-full bg-stone-900 px-6 py-3 text-sm font-medium text-white transition hover:bg-stone-700"
              >
                Create viewing
              </button>
              <Link
                href="/my-viewings"
                className="inline-flex items-center rounded-full border border-stone-300 px-6 py-3 text-sm font-medium text-stone-700 transition hover:border-stone-400 hover:text-stone-900"
              >
                Cancel
              </Link>
            </div>
          </form>
        </div>
      </section>
    </main>
  )
}
