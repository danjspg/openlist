"use client"

import Link from "next/link"
import { useAuthState } from "@/components/AuthStateProvider"

export default function AccountFooterLink() {
  const { isAuthenticated } = useAuthState()

  return (
    <>
      {isAuthenticated ? (
        <Link href="/my-alerts" className="transition hover:text-stone-900">
          My alerts
        </Link>
      ) : null}
      <Link
        href={isAuthenticated ? "/my-viewings" : "/viewings"}
        className="transition hover:text-stone-900"
      >
        {isAuthenticated ? "My viewings" : "Viewings"}
      </Link>
    </>
  )
}
