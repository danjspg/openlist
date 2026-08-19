"use client"

import { useState } from "react"

function relativeDecisionDueText(date: string, now = new Date()) {
  const due = new Date(`${date}T00:00:00Z`)
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  const difference = Math.round((due.getTime() - today) / 86_400_000)
  if (difference === 0) return "today"
  if (difference > 0) return `in ${difference} ${difference === 1 ? "day" : "days"}`
  return `${Math.abs(difference)} ${difference === -1 ? "day" : "days"} ago`
}

export function DecisionDueRelativeText({ date }: { date: string }) {
  // The server output remains empty and stable; the browser fills this from
  // its own calendar on hydration.
  const [text] = useState(() =>
    typeof window === "undefined" ? "" : relativeDecisionDueText(date)
  )

  return <p suppressHydrationWarning className="mt-1 text-sm text-stone-500">{text}</p>
}

export { relativeDecisionDueText }
