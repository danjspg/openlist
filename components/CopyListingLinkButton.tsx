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
      className="inline-flex items-center rounded-full border border-slate-300 px-4 py-2 text-sm font-medium text-slate-900 transition hover:bg-slate-100"
    >
      {copied ? "Copied link" : "Copy link"}
    </button>
  )
}