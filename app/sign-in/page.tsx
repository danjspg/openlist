import type { Metadata } from "next"
import AuthEmailForm from "@/components/AuthEmailForm"
import { getSafeRedirectPath } from "@/lib/seller-auth"

export const metadata: Metadata = {
  title: "Sign in | OpenList",
  robots: {
    index: false,
    follow: false,
  },
}

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ redirectTo?: string; error?: string }>
}) {
  const { redirectTo, error } = await searchParams
  const next = getSafeRedirectPath(redirectTo, "/my-listings")

  return (
    <main className="min-h-screen bg-stone-50">
      <section className="mx-auto max-w-3xl px-4 py-14 sm:px-6 sm:py-16">
        <div className="rounded-[32px] border border-stone-200 bg-white p-6 shadow-sm sm:p-8">
          <p className="text-sm font-medium uppercase tracking-[0.28em] text-stone-500">
            OpenList
          </p>
          <h1 className="mt-4 text-4xl font-semibold tracking-tight text-stone-900 sm:text-5xl">
            Sign in to manage your listings
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-7 text-stone-600 sm:text-lg sm:leading-8">
            Use your email to sign in securely. Once signed in, you can create listings, manage your own properties, and edit anything you own.
          </p>

          {error === "invalid_link" && (
            <div className="mt-6 rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700">
              That sign-in link is no longer valid. Please request a new one.
            </div>
          )}

          <div className="mt-8">
            <AuthEmailForm redirectTo={next} />
          </div>
        </div>
      </section>
    </main>
  )
}
