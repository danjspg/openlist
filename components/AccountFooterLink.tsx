"use client"

import Link from "next/link"
import { useAuthState } from "@/components/AuthStateProvider"
import { shouldShowMyViewings } from "@/lib/account-navigation"

export default function AccountFooterLink() {
  const { isAuthenticated, hasViewings } = useAuthState()
  const showMyViewings = shouldShowMyViewings(isAuthenticated, hasViewings)

  return (
    <>
      {isAuthenticated ? (
        <Link prefetch={false} href="/my-alerts" className="transition hover:text-stone-900">
          My alerts
        </Link>
      ) : null}
      {isAuthenticated ? (
        showMyViewings ? (
          <Link prefetch={false} href="/my-viewings" className="transition hover:text-stone-900">
            My viewings
          </Link>
        ) : null
      ) : (
        <Link prefetch={false} href="/viewings" className="transition hover:text-stone-900">
          Viewings
        </Link>
      )}
    </>
  )
}
