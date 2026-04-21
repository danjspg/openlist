"use client"

import { useState } from "react"

export default function CopyListingLinkButton({
  slug,
}: {
  slug: string
}) {
  const [copied, setCopied] = useState(false)

  async function handleCopy() {
    const url = `${window.location.origin}/listings/${slug}`
    await navigator.clipboard.writeText(url)
    setCopied(true)

    window.setTimeout(() => {
      setCopied(false)
    }, 1800)
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      className={`inline-flex items-center rounded-full px-4 py-2 text-sm font-medium transition ${
        copied
          ? "bg-emerald-600 text-white shadow-[0_1px_2px_rgba(5,150,105,0.18)] hover:bg-emerald-600"
          : "border border-slate-300 bg-white text-slate-900 shadow-[0_1px_2px_rgba(0,0,0,0.04)] hover:bg-slate-50"
      }`}
    >
      {copied ? (
        <>
          <svg
            className="mr-2 h-3.5 w-3.5"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M20 6 9 17l-5-5" />
          </svg>
          Copied
        </>
      ) : (
        <>
          <svg
            className="mr-2 h-3.5 w-3.5 text-slate-500"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <rect x="9" y="9" width="13" height="13" rx="2" />
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
          </svg>
          Copy link
        </>
      )}
    </button>
  )
}
