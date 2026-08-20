import Link from "next/link"

export default function PrivacyReference({
  children = "By continuing, you agree that OpenList may use your email address to provide the service you request.",
}: {
  children?: React.ReactNode
}) {
  return (
    <p className="text-xs leading-5 text-stone-500">
      {children} {" "}
      <Link
        href="/privacy"
        className="font-medium text-stone-600 underline underline-offset-4 transition hover:text-stone-900"
      >
        Privacy Notice
      </Link>
    </p>
  )
}
