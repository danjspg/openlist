"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"

export default function AdminFeaturedToggle({
  slug,
  featured,
}: {
  slug: string
  featured: boolean
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState("")

  function handleToggle(nextFeatured: boolean) {
    setError("")

    startTransition(async () => {
      const response = await fetch(`/api/admin/listings/${slug}/featured`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({ featured: nextFeatured }),
      })

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null
        setError(payload?.error || "Unauthorized")
        return
      }

      router.refresh()
    })
  }

  return (
    <div className="rounded-3xl border border-stone-200 bg-white p-5 shadow-sm sm:p-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-stone-500">
            Admin
          </p>
          <h3 className="mt-2 text-lg font-semibold text-stone-900">
            Featured listing
          </h3>
        </div>

        <span className="inline-flex items-center rounded-full border border-stone-200 bg-stone-50 px-3 py-1 text-xs font-medium text-stone-700">
          Featured: {featured ? "On" : "Off"}
        </span>
      </div>

      <div className="mt-4 flex flex-wrap gap-3">
        <button
          type="button"
          onClick={() => handleToggle(!featured)}
          disabled={isPending}
          className="inline-flex items-center rounded-full bg-stone-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-stone-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {featured ? "Remove Featured" : "Mark as Featured"}
        </button>
      </div>

      {error && (
        <p className="mt-3 text-sm text-red-700">{error}</p>
      )}
    </div>
  )
}
