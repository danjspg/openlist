import type { Metadata } from "next"
import Link from "next/link"
import { getCurrentAdminEmail } from "@/lib/admin-auth"
import { grantAdminAccess, revokeAdminAccess } from "./actions"

export const metadata: Metadata = {
  title: "Admin Access | OpenList",
  robots: {
    index: false,
    follow: false,
  },
}

export default async function AdminAccessPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; returnTo?: string }>
}) {
  const { error, returnTo = "/" } = await searchParams
  const adminEmail = await getCurrentAdminEmail()

  return (
    <main className="min-h-screen bg-stone-50">
      <section className="mx-auto max-w-2xl px-4 py-12 sm:px-6">
        <div className="rounded-[32px] border border-stone-200 bg-white p-6 shadow-sm sm:p-8">
          <p className="text-sm font-medium uppercase tracking-[0.24em] text-stone-500">
            OpenList
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-stone-900">
            Admin access
          </h1>
          <p className="mt-3 max-w-xl text-base leading-7 text-stone-600">
            Admin access is limited to approved email addresses and a separate access code.
          </p>

          {error === "1" && (
            <div className="mt-6 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              Unauthorized
            </div>
          )}

          {adminEmail ? (
            <div className="mt-8 space-y-5">
              <div className="rounded-2xl border border-stone-200 bg-stone-50 px-4 py-4">
                <p className="text-sm text-stone-500">Signed in as</p>
                <p className="mt-1 font-medium text-stone-900">{adminEmail}</p>
              </div>

              <div className="flex flex-wrap gap-3">
                <Link
                  href={returnTo}
                  className="inline-flex items-center rounded-full bg-stone-900 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-stone-700"
                >
                  Continue
                </Link>

                <form action={revokeAdminAccess}>
                  <input type="hidden" name="returnTo" value={returnTo} />
                  <button
                    type="submit"
                    className="inline-flex items-center rounded-full border border-stone-300 bg-white px-5 py-2.5 text-sm font-medium text-stone-700 transition hover:border-stone-400 hover:text-stone-900"
                  >
                    Sign out
                  </button>
                </form>
              </div>
            </div>
          ) : (
            <form action={grantAdminAccess} className="mt-8 space-y-5">
              <input type="hidden" name="returnTo" value={returnTo} />

              <div>
                <label
                  htmlFor="email"
                  className="mb-2 block text-sm font-medium text-stone-700"
                >
                  Admin email
                </label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  required
                  className="h-12 w-full rounded-full border border-stone-300 bg-white px-4 text-sm text-stone-900 outline-none transition placeholder:text-stone-400 focus:border-stone-500"
                  placeholder="you@example.com"
                />
              </div>

              <div>
                <label
                  htmlFor="accessCode"
                  className="mb-2 block text-sm font-medium text-stone-700"
                >
                  Access code
                </label>
                <input
                  id="accessCode"
                  name="accessCode"
                  type="password"
                  required
                  className="h-12 w-full rounded-full border border-stone-300 bg-white px-4 text-sm text-stone-900 outline-none transition focus:border-stone-500"
                />
              </div>

              <button
                type="submit"
                className="inline-flex items-center rounded-full bg-stone-900 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-stone-700"
              >
                Continue as admin
              </button>
            </form>
          )}
        </div>
      </section>
    </main>
  )
}
