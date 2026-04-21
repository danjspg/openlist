"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { getSellerAuthRedirectUrl } from "@/lib/site-url"
import { supabase } from "@/lib/supabase"

export default function AuthEmailForm({
  redirectTo,
}: {
  redirectTo: string
}) {
  const MIN_OTP_LENGTH = 6
  const MAX_OTP_LENGTH = 10
  const router = useRouter()
  const [email, setEmail] = useState("")
  const [code, setCode] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState("")
  const [info, setInfo] = useState("")

  async function sendLink() {
    setError("")
    setInfo("")

    try {
      setIsSubmitting(true)
      const redirectUrl = getSellerAuthRedirectUrl(redirectTo)

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
      setInfo("We’ve emailed both a sign-in link and a sign-in code.")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send sign-in link.")
    } finally {
      setIsSubmitting(false)
    }
  }

  async function handleSend(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    await sendLink()
  }

  async function handleVerifyCode(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError("")
    setInfo("")

    try {
      setIsSubmitting(true)

      const response = await fetch("/auth/verify-code", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: email.trim(),
          token: code.trim(),
          next: redirectTo,
        }),
      })

      const payload = await response.json()

      if (!response.ok) {
        throw new Error(payload?.error || "Could not verify that code.")
      }

      router.push(payload.redirectTo || redirectTo)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not verify that code.")
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="rounded-[28px] border border-stone-200 bg-white p-6 shadow-sm">
      {!sent ? (
        <form onSubmit={handleSend}>
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
            We&apos;ll email you a secure sign-in link and sign-in code. If you don&apos;t have an account yet, one will be created for you.
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
      ) : (
        <div>
          <p className="text-lg font-semibold tracking-tight text-stone-900">
            Check your email
          </p>
          <p className="mt-3 text-sm leading-6 text-stone-600">
            We sent a secure sign-in link to <span className="font-medium text-stone-900">{email}</span>.
            If the link gets opened by your email app first, you can still sign in with the code from your email below.
          </p>

          {info && (
            <p className="mt-4 text-sm text-stone-600">
              {info}
            </p>
          )}

          <div className="mt-6 rounded-[24px] border border-stone-200 bg-stone-50 p-5">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-medium uppercase tracking-[0.18em] text-stone-500">
                  Enter code instead
                </p>
                <p className="mt-2 text-sm leading-6 text-stone-600">
                  Enter the sign-in code from your email to continue.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  void sendLink()
                }}
                disabled={isSubmitting}
                className="text-sm font-medium text-stone-600 transition hover:text-stone-900 disabled:opacity-50"
              >
                Resend email
              </button>
            </div>

            <form onSubmit={handleVerifyCode} className="mt-5">
              <label className="mb-2 block text-sm font-medium text-stone-700">
                Sign-in code
              </label>
              <input
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern={`[0-9]{${MIN_OTP_LENGTH},${MAX_OTP_LENGTH}}`}
                minLength={MIN_OTP_LENGTH}
                maxLength={MAX_OTP_LENGTH}
                value={code}
                onChange={(event) =>
                  setCode(
                    event.target.value.replace(/\D/g, "").slice(0, MAX_OTP_LENGTH)
                  )
                }
                required
                placeholder="Enter your code"
                className="w-full rounded-2xl border border-stone-300 bg-white px-4 py-3 text-stone-900 outline-none transition placeholder:text-stone-400 focus:border-stone-500 sm:max-w-xs"
              />
              <p className="mt-2 text-xs text-stone-500">
                Supabase email codes can vary in length depending on project settings.
              </p>

              {error && (
                <p className="mt-4 text-sm text-red-600">
                  {error}
                </p>
              )}

              <button
                type="submit"
                disabled={isSubmitting || code.trim().length < MIN_OTP_LENGTH}
                className="mt-5 inline-flex items-center rounded-full bg-stone-900 px-5 py-3 text-sm font-medium text-white transition hover:bg-stone-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSubmitting ? "Signing in..." : "Verify code"}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
