"use client"

import Link from "next/link"
import { useAuthState } from "@/components/AuthStateProvider"

export default function AccountFooterLink() {
  const { isAuthenticated } = useAuthState()

  return (
    <Link
      href={isAuthenticated ? "/my-viewings" : "/viewings"}
      className="transition hover:text-stone-900"
    >
      {isAuthenticated ? "My viewings" : "Viewings"}
    </Link>
  )
}
