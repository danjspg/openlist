import Link from "next/link"

type Props = {
  className?: string
  theme?: "light" | "dark"
}

export default function PprSellConversion({
  className = "",
  theme = "light",
}: Props) {
  const isDark = theme === "dark"

  return (
    <div
      className={`rounded-[28px] ${
        isDark
          ? "bg-stone-900 p-6 text-white shadow-sm"
          : "border border-stone-200 bg-white p-6 shadow-sm"
      } ${className}`.trim()}
    >
      <p
        className={`text-sm uppercase tracking-[0.2em] ${
          isDark ? "text-stone-300" : "text-stone-500"
        }`}
      >
        Thinking of selling?
      </p>
      <h2
        className={`mt-3 text-2xl font-semibold tracking-tight ${
          isDark ? "text-white" : "text-stone-900"
        }`}
      >
        Sell your home privately with a clear, well-presented listing.
      </h2>
      <p
        className={`mt-3 text-sm leading-6 ${
          isDark ? "text-stone-300" : "text-stone-600"
        }`}
      >
        Use recent sale prices to guide how you position your property for
        buyers.
      </p>
      <Link
        href="/sell"
        className={`mt-6 inline-flex rounded-full px-5 py-2.5 text-sm font-medium transition ${
          isDark
            ? "bg-white text-stone-900 hover:bg-stone-200"
            : "bg-stone-900 text-white hover:bg-stone-700"
        }`}
      >
        List your home privately
      </Link>
    </div>
  )
}
