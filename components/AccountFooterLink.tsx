"use client"

import Link from "@/components/RuntimeDataLink"
import { useAuthState } from "@/components/AuthStateProvider"
import { shouldShowMyViewings } from "@/lib/account-navigation"

export default function AccountFooterLink() {
  const { isAuthenticated, hasViewings } = useAuthState()
  const showMyViewings = shouldShowMyViewings(isAuthenticated, hasViewings)

  return (
    <>
      {isAuthenticated ? (
        <Link href="/my-alerts" className="transition hover:text-stone-900">
          My alerts
        </Link>
      ) : null}
      {isAuthenticated ? (
        showMyViewings ? (
          <Link href="/my-viewings" className="transition hover:text-stone-900">
            My viewings
          </Link>
        ) : null
      ) : (
        <Link href="/viewings" className="transition hover:text-stone-900">
          Viewings
        </Link>
      )}
    </>
  )
}
