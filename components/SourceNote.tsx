export default function SourceNote({
  title = "Source & limitations",
  children,
  compact = false,
}: {
  title?: string
  children: React.ReactNode
  compact?: boolean
}) {
  return (
    <aside
      className={`rounded-2xl border border-stone-200 bg-stone-50/80 ${
        compact ? "px-4 py-3" : "p-5"
      }`}
    >
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-stone-400">
        {title}
      </p>
      <div className={`${compact ? "mt-1.5" : "mt-3"} text-sm leading-6 text-stone-600`}>
        {children}
      </div>
    </aside>
  )
}
