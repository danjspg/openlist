"use client"

import { useState } from "react"
import { submitEnquiry } from "./enquiry-actions"

export default function EnquiryForm({
  listingSlug,
  listingTitle,
}: {
  listingSlug: string
  listingTitle: string
}) {
  const [status, setStatus] = useState<"idle" | "submitting" | "success" | "error">("idle")
  const [errorMessage, setErrorMessage] = useState("")

  async function handleSubmit(formData: FormData) {
    setStatus("submitting")
    setErrorMessage("")

    const result = await submitEnquiry(formData)

    if (!result.success) {
      setStatus("error")
      setErrorMessage(result.error || "Something went wrong.")
      return
    }

    setStatus("success")
  }

  return (
    <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
      <div className="mb-6">
        <p className="text-sm font-medium uppercase tracking-[0.22em] text-slate-500">
          Enquiry
        </p>
        <h3 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">
          Ask about this property
        </h3>
        <p className="mt-3 text-slate-600">
          Send an enquiry about{" "}
          <span className="font-medium text-slate-900">{listingTitle}</span>.
        </p>
      </div>

      {status === "success" ? (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-800">
          Thanks — your enquiry has been sent.
        </div>
      ) : (
        <form action={handleSubmit} className="space-y-4">
          <input type="hidden" name="listingSlug" value={listingSlug} />
          <input type="hidden" name="listingTitle" value={listingTitle} />

          <div>
            <label
              htmlFor="name"
              className="mb-2 block text-sm font-medium text-slate-700"
            >
              Name
            </label>
            <input
              id="name"
              name="name"
              type="text"
              required
              className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-slate-900 outline-none transition focus:border-slate-500"
              placeholder="Your name"
            />
          </div>

          <div>
            <label
              htmlFor="email"
              className="mb-2 block text-sm font-medium text-slate-700"
            >
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              required
              className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-slate-900 outline-none transition focus:border-slate-500"
              placeholder="you@example.com"
            />
          </div>

          <div>
            <label
              htmlFor="phone"
              className="mb-2 block text-sm font-medium text-slate-700"
            >
              Phone
            </label>
            <input
              id="phone"
              name="phone"
              type="text"
              className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-slate-900 outline-none transition focus:border-slate-500"
              placeholder="Optional"
            />
          </div>

          <div>
            <label
              htmlFor="message"
              className="mb-2 block text-sm font-medium text-slate-700"
            >
              Message
            </label>
            <textarea
              id="message"
              name="message"
              required
              rows={5}
              className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-slate-900 outline-none transition focus:border-slate-500"
              defaultValue={`Hi, I’m interested in ${listingTitle}. Please send me more details.`}
            />
          </div>

          {status === "error" && (
            <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-red-700">
              {errorMessage}
            </div>
          )}

          <button
            type="submit"
            disabled={status === "submitting"}
            className="inline-flex items-center rounded-full bg-slate-900 px-6 py-3 text-sm font-medium text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {status === "submitting" ? "Sending..." : "Send enquiry"}
          </button>
        </form>
      )}
    </div>
  )
}