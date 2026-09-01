"use client"

import Link from "@/components/RuntimeDataLink"
import { useAuthState } from "@/components/AuthStateProvider"

export default function ViewingsPrimaryLink() {
  const { isAuthenticated } = useAuthState()

  return (
    <Link
      href={
        isAuthenticated
          ? "/my-viewings"
          : "/sign-in?redirectTo=%2Fmy-viewings"
      }
      className="rounded-full bg-stone-900 px-5 py-3 text-sm font-medium text-white transition hover:bg-stone-700 sm:px-6"
    >
      Start managing viewings
    </Link>
  )
}
