"use client"

import { useState } from "react"
import { supabase } from "@/lib/supabase"

export default function AuthEmailForm({
  redirectTo,
}: {
  redirectTo: string
}) {
  const [email, setEmail] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState("")

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError("")

    try {
      setIsSubmitting(true)
      const redirectUrl = `${window.location.origin}/auth/callback?next=${encodeURIComponent(redirectTo)}`

      const { error } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: {
          emailRedirectTo: redirectUrl,
          shouldCreateUser: true,
        },
      })

      if (error) {
        throw error
      }

      setSent(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send sign-in link.")
    } finally {
      setIsSubmitting(false)
    }
  }

  if (sent) {
    return (
      <div className="rounded-[28px] border border-stone-200 bg-white p-6 shadow-sm">
        <p className="text-lg font-semibold tracking-tight text-stone-900">
          Check your email
        </p>
        <p className="mt-3 text-sm leading-6 text-stone-600">
          We sent a secure sign-in link to <span className="font-medium text-stone-900">{email}</span>.
          Open it on this device to continue.
        </p>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-[28px] border border-stone-200 bg-white p-6 shadow-sm">
      <label className="mb-2 block text-sm font-medium text-stone-700">
        Email address
      </label>
      <input
        type="email"
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        required
        placeholder="you@example.com"
        className="w-full rounded-2xl border border-stone-300 bg-white px-4 py-3 text-stone-900 outline-none transition placeholder:text-stone-400 focus:border-stone-500"
      />
      <p className="mt-2 text-xs text-stone-500">
        We&apos;ll email you a secure sign-in link. If you don&apos;t have an account yet, one will be created for you.
      </p>

      {error && (
        <p className="mt-4 text-sm text-red-600">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={isSubmitting}
        className="mt-5 inline-flex items-center rounded-full bg-stone-900 px-5 py-3 text-sm font-medium text-white transition hover:bg-stone-700 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isSubmitting ? "Sending..." : "Email me a sign-in link"}
      </button>
    </form>
  )
}
