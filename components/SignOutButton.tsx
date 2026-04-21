"use client"

export default function SignOutButton() {
  async function handleSignOut() {
    await fetch("/auth/sign-out", {
      method: "POST",
    })
    window.location.href = "/"
  }

  return (
    <button
      type="button"
      onClick={handleSignOut}
      className="inline-flex items-center rounded-full border border-stone-300 px-5 py-2.5 text-base font-medium text-stone-700 transition hover:border-stone-900 hover:text-stone-900"
    >
      Sign out
    </button>
  )
}
