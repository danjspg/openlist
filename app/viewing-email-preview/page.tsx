import Link from "next/link"
import { notFound } from "next/navigation"
import {
  getViewingCancellationSubject,
  getViewingConfirmationSubject,
  getViewingReminderSubject,
  getViewingUpdateSubject,
  renderViewingCancellationEmailHtml,
  renderViewingConfirmationEmailHtml,
  renderViewingReminderEmailHtml,
  renderViewingUpdateEmailHtml,
} from "@/lib/viewing-emails"
import type { ViewingRow } from "@/lib/viewings"

export const metadata = {
  title: "Viewing Email Preview | OpenList",
  robots: {
    index: false,
    follow: false,
  },
}

const sampleViewing: ViewingRow = {
  id: "preview-email-1",
  created_at: "2026-05-31T12:00:00.000Z",
  owner_user_id: "preview",
  viewer_name: "Aoife Murphy",
  viewer_email: "aoife@example.com",
  viewer_phone: "087 000 0000",
  contact_name: "Donal",
  contact_email: "donal@example.com",
  contact_phone: "086 000 0000",
  property_location: "12 Harbour View\nKinsale\nCo. Cork",
  viewing_starts_at: "2026-06-02T11:00:00.000Z",
  notes: "Meet at the front gate. Parking is available across the road.",
  status: "scheduled",
}

const emailPreviews = [
  {
    id: "confirmation",
    label: "Confirmation",
    subject: getViewingConfirmationSubject(sampleViewing),
    html: renderViewingConfirmationEmailHtml(sampleViewing),
    attachment: "openlist-viewing.ics",
  },
  {
    id: "reminder",
    label: "Reminder",
    subject: getViewingReminderSubject(sampleViewing),
    html: renderViewingReminderEmailHtml(sampleViewing),
    attachment: "openlist-viewing.ics",
  },
  {
    id: "update",
    label: "Update",
    subject: getViewingUpdateSubject(sampleViewing),
    html: renderViewingUpdateEmailHtml(sampleViewing),
    attachment: "openlist-viewing.ics",
  },
  {
    id: "cancellation",
    label: "Cancellation",
    subject: getViewingCancellationSubject(sampleViewing),
    html: renderViewingCancellationEmailHtml(sampleViewing),
    attachment: null,
  },
]

export default function ViewingEmailPreviewPage() {
  if (process.env.NODE_ENV === "production") {
    notFound()
  }

  return (
    <main className="min-h-screen bg-stone-50">
      <section className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-12">
        <div className="mb-8 rounded-[32px] border border-stone-200 bg-white p-6 shadow-sm sm:p-8">
          <p className="text-sm font-medium uppercase tracking-[0.24em] text-stone-500">
            Preview
          </p>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight text-stone-900 sm:text-5xl">
            Viewing emails
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-7 text-stone-600">
            These previews use the same HTML renderers as the real Resend emails.
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            {emailPreviews.map((email) => (
              <a
                key={email.id}
                href={`#${email.id}`}
                className="inline-flex rounded-full border border-stone-300 px-4 py-2 text-sm font-medium text-stone-700 transition hover:border-stone-900 hover:text-stone-900"
              >
                {email.label}
              </a>
            ))}
          </div>
        </div>

        <div className="space-y-10">
          {emailPreviews.map((email) => (
            <section
              key={email.id}
              id={email.id}
              className="scroll-mt-28 rounded-[28px] border border-stone-200 bg-white p-4 shadow-sm sm:p-5"
            >
              <div className="mb-4 flex flex-wrap items-start justify-between gap-4 px-1">
                <div>
                  <h2 className="text-2xl font-semibold tracking-tight text-stone-900">
                    {email.label}
                  </h2>
                  <p className="mt-2 break-words text-sm text-stone-600">
                    Subject: <span className="font-medium text-stone-900">{email.subject}</span>
                  </p>
                  <p className="mt-1 text-sm text-stone-500">
                    Attachment: {email.attachment ?? "None"}
                  </p>
                </div>
              </div>

              <div className="overflow-hidden rounded-[20px] border border-stone-200 bg-stone-100">
                <iframe
                  title={`${email.label} email preview`}
                  srcDoc={email.html}
                  className="h-[760px] w-full bg-white"
                />
              </div>
            </section>
          ))}
        </div>

        <div className="mt-8">
          <Link href="/viewing-planner-preview" className="text-sm font-medium text-stone-500 hover:text-stone-900">
            Viewing Planner preview
          </Link>
        </div>
      </section>
    </main>
  )
}
